// Bundles the optimizer worker into a self-contained CJS file that ships in
// the Next.js standalone output (.next/standalone → /app at runtime), so the
// genetic algorithm can run in a worker_threads worker off the main event
// loop. Runs after `next build` (see package.json).
//
// Non-fatal by design: if bundling fails we warn and exit 0 so the deploy
// build still succeeds. startOptimization then finds no worker file (its
// existsSync gate) and falls back to running the optimization in-process —
// i.e. exactly today's behavior. The worker is a pure performance win when
// present, never a correctness dependency.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, ".next", "standalone");
const outfile = join(outdir, "optimizer-worker.cjs");

async function run() {
  if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });
  await build({
    entryPoints: [join(root, "src", "lib", "optimizer-worker.ts")],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    outfile,
    alias: { "@": join(root, "src") },
    // Bundle EVERYTHING into the .cjs (no externals). Next's standalone trace
    // does not place node_modules where this file can require() them at
    // runtime (e.g. `Cannot find module 'pino'`), so anything left external
    // fails in prod. The optimizer's import graph has no native addons —
    // pino/drizzle/postgres are all pure JS — so a fully self-contained
    // bundle resolves nothing at runtime and can't hit a missing module.
    // Lazy/dynamic requires that aren't statically resolvable (e.g. web-push
    // via runtimeLoader) stay as runtime requires but are never hit by the
    // optimizer path.
    external: [],
    logLevel: "warning",
    minify: false,
  });
  console.log(`✓ optimizer worker bundled → ${outfile}`);
}

run().catch((err) => {
  console.warn(`⚠ optimizer-worker bundle skipped (${err?.message ?? err}). Optimizer will run in-process.`);
  process.exit(0); // never fail the deploy build over the worker bundle
});
