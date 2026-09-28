export async function register() {
  // Only run on the server, not during build or in edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail-fast env validation: a missing JWT_SECRET / ENCRYPTION_KEY in prod
    // is a silent footgun — surfaces as garbled cookies or undecipherable
    // broker tokens later. Crash the boot instead.
    try {
      const { validateEnv } = await import("./lib/env");
      validateEnv();
    } catch (err) {
      console.error("FATAL: env validation failed at boot");
      console.error(err instanceof Error ? err.message : err);
      if (process.env.NODE_ENV === "production") {
        process.exit(1);
      }
    }

    // Delay to let the DB connection pool initialize
    setTimeout(async () => {
      try {
        const { bootEngines } = await import("./lib/engine-boot");
        await bootEngines();
      } catch (err) {
        console.error("Engine boot failed:", err);
      }

      // Clean up orphaned optimizer runs from the previous container.
      // GA runs live in the Node process — when a deploy or crash kills
      // the container mid-run, the DB row stays at status='optimizing'
      // forever, blocking new runs. This sweep flips stale rows to
      // 'failed' so the user can start fresh.
      try {
        const { cleanupOrphanedOptimizerRuns } = await import("./lib/optimizer-boot-cleanup");
        await cleanupOrphanedOptimizerRuns();
      } catch (err) {
        console.error("Optimizer cleanup failed:", err);
      }

      try {
        const { startScreenerScheduler } = await import("./lib/screener");
        startScreenerScheduler();
      } catch (err) {
        console.error("Screener scheduler start failed:", err);
      }

      try {
        const { startWatchdog } = await import("./lib/engine-watchdog");
        startWatchdog();
      } catch (err) {
        console.error("Engine watchdog start failed:", err);
      }

      // Standalone broker-stop sync scheduler. Decoupled from scan
      // completion so a hung scan can't freeze broker-side stops for
      // the whole session. Fires immediately at boot so a fresh
      // container picks up where the previous one left off, then
      // settles into a 5-min cadence. See stop-sync-scheduler.ts
      // for the incident this addresses.
      try {
        const { startStopSyncScheduler, runStopSyncCycle } = await import("./lib/stop-sync-scheduler");
        startStopSyncScheduler();
        void runStopSyncCycle().catch((err) => {
          console.error("Initial stop-sync cycle failed:", err);
        });
      } catch (err) {
        console.error("Stop-sync scheduler start failed:", err);
      }
    }, 5000);

    // Graceful shutdown: when podman/Docker sends SIGTERM, stop every running
    // engine so placeSafetyStops() runs before the process dies. Without this,
    // a container rebuild leaves positions with whatever stop was last replaced —
    // the bug that left INTC unprotected for 2 days during the Apr 28–30 outage.
    //
    // This handler must be the ONLY one that exits. Next's standalone server
    // registers its own SIGTERM/SIGINT cleanup, which ends in process.exit(0)
    // after a few local closes, well before the drain has touched the broker.
    // The Dockerfile sets NEXT_MANUAL_SIG_HANDLE=true to switch that off; the
    // listener count check below says so loudly if it is ever missing.
    // Timings (drain budget, force exit, container grace) live in
    // lib/shutdown-config.ts and are checked against the Dockerfile and
    // compose file by tests/unit/shutdown-config.test.ts.
    const g = globalThis as typeof globalThis & { __shutdownRegistered?: boolean };
    if (!g.__shutdownRegistered) {
      g.__shutdownRegistered = true;

      const { FORCE_EXIT_MS } = await import("./lib/shutdown-config");
      const { runShutdownOnce } = await import("./lib/shutdown-state");

      // runShutdownOnce marks the process as shutting down before anything
      // else (startEngine and the order routes refuse from then on), and runs
      // the drain once. A second signal during the drain waits for it instead
      // of starting another drain whose finally would exit part-way.
      const handleShutdown = (sig: string) => {
        const { first } = runShutdownOnce(async () => {
          console.log(`[shutdown] ${sig} received, stopping engines`);
          const forceExit = setTimeout(() => {
            console.error("[shutdown] timeout exceeded, forcing exit");
            process.exit(1);
          }, FORCE_EXIT_MS); // above the drain budget, below the container stop grace

          try {
            const { shutdownAllEngines } = await import("./lib/trading-engine");
            await shutdownAllEngines();
            console.log("[shutdown] engines stopped, safety stops placed");
          } catch (err) {
            console.error("[shutdown] error during shutdown:", err);
          } finally {
            clearTimeout(forceExit);
            process.exit(0);
          }
        });
        if (!first) console.log(`[shutdown] ${sig} received during the drain; waiting for it to finish`);
      };

      process.on("SIGTERM", () => handleShutdown("SIGTERM"));
      process.on("SIGINT", () => handleShutdown("SIGINT"));

      // Any other SIGTERM listener (Next's own cleanup, when
      // NEXT_MANUAL_SIG_HANDLE is unset) races this one to process.exit and
      // wins, so the safety stops are never placed.
      const sigtermListeners = process.listenerCount("SIGTERM");
      if (process.env.NODE_ENV === "production" && sigtermListeners > 1) {
        console.error(
          `[shutdown] ${sigtermListeners} SIGTERM listeners registered; another handler can exit ` +
            "before the engine drain places safety stops. Set NEXT_MANUAL_SIG_HANDLE=true."
        );
      }
    }
  }
}
