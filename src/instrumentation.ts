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

      try {
        const { startScreenerScheduler } = await import("./lib/screener");
        startScreenerScheduler();
      } catch (err) {
        console.error("Screener scheduler start failed:", err);
      }
    }, 5000);
  }
}
