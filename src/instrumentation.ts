export async function register() {
  // Only run on the server, not during build or in edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
