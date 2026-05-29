/**
 * Optimizer worker entry — runs the CPU-bound genetic algorithm OFF the main
 * Next.js event loop so concurrent requests (broker status, dashboard polls)
 * aren't starved during a run.
 *
 * This file is NOT imported by the app. It is bundled standalone by
 * `scripts/build-optimizer-worker.mjs` (esbuild → .next/standalone/
 * optimizer-worker.cjs) and spawned via worker_threads from
 * `startOptimization`. The import-time guard makes accidentally importing it
 * on the main thread a no-op.
 *
 * Progress: runOptimization mutates the worker's own globalThis __optimizerJobs
 * map. We snapshot that to the main thread every ~500ms so the GET route's
 * live view (generation / best fitness) keeps updating; the worker writes the
 * final result rows to the DB itself.
 */
import { parentPort, workerData, isMainThread } from "node:worker_threads";
import {
  runOptimization,
  initJobProgress,
  getJobProgress,
  type OptimizationConfig,
} from "./optimizer";

interface WorkerInput {
  runId: string;
  config: OptimizationConfig;
}

async function main(): Promise<void> {
  const { runId, config } = workerData as WorkerInput;

  // runOptimization reads/mutates this map; seed it in the worker's globalThis.
  initJobProgress(runId, config);

  const snapshot = () => {
    const p = getJobProgress(runId);
    if (p) parentPort!.postMessage({ type: "progress", progress: p });
  };
  const interval = setInterval(snapshot, 500);

  try {
    await runOptimization(runId, config);
    snapshot(); // flush final state (status=complete, last generation)
    parentPort!.postMessage({ type: "done" });
  } catch (err) {
    parentPort!.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearInterval(interval);
  }

  // Give the last message a tick to flush over the channel, then exit so the
  // worker (and its DB pool) is torn down rather than lingering.
  setTimeout(() => process.exit(0), 150);
}

// Only execute inside an actual worker. Importing on the main thread is a no-op.
if (!isMainThread && parentPort && workerData) {
  void main();
}
