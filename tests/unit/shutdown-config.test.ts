/**
 * Shutdown ownership and timing (WP03, findings #0, #1).
 *
 * The SIGTERM drain in src/instrumentation.ts places broker-side safety stops
 * for every open position. It only works when:
 *   - it is the only SIGTERM handler that exits: Next's standalone server has
 *     its own, which process.exit(0)s first unless NEXT_MANUAL_SIG_HANDLE is
 *     set in the image;
 *   - the timings nest: drain budget < force exit < container stop grace.
 *     Past the grace the runtime SIGKILLs, wherever the drain happens to be.
 *
 * These read the real Dockerfile, compose file and stop commands, so a change
 * to any of them that breaks the ordering fails CI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRAIN_BUDGET_MS,
  FORCE_EXIT_MS,
  CONTAINER_STOP_GRACE_S,
} from "@/lib/shutdown-config";

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf-8");

/** The runner stage of the Dockerfile: everything after the last FROM. */
function runnerStage(dockerfile: string): string {
  const idx = dockerfile.lastIndexOf("\nFROM ");
  return idx === -1 ? dockerfile : dockerfile.slice(idx);
}

/** Parse a compose duration like "30s", "1m", "1m30s" into seconds. */
function composeDurationSeconds(v: string): number {
  const re = /(\d+(?:\.\d+)?)(h|ms|m|s|us)/g;
  const unit: Record<string, number> = { h: 3600, m: 60, s: 1, ms: 0.001, us: 0.000001 };
  let total = 0;
  let matched = "";
  for (const m of v.matchAll(re)) {
    total += parseFloat(m[1]) * unit[m[2]];
    matched += m[0];
  }
  if (matched !== v) throw new Error(`Unparseable compose duration: ${v}`);
  return total;
}

describe("shutdown timing constants", () => {
  it("nest: drain budget < force exit < container stop grace", () => {
    expect(DRAIN_BUDGET_MS).toBeGreaterThan(0);
    expect(FORCE_EXIT_MS).toBeGreaterThan(DRAIN_BUDGET_MS);
    expect(CONTAINER_STOP_GRACE_S * 1000).toBeGreaterThan(FORCE_EXIT_MS);
  });
});

describe("Dockerfile", () => {
  it("sets NEXT_MANUAL_SIG_HANDLE in the runner stage so only the app handler exits", () => {
    const stage = runnerStage(read("Dockerfile"));
    expect(stage).toMatch(/^ENV NEXT_MANUAL_SIG_HANDLE=(true|1)\s*$/m);
  });
});

describe("docker-compose.yml", () => {
  const compose = read("docker-compose.yml");
  const app = compose.slice(compose.indexOf("\n  sentinel:"));

  it("gives the app a stop_grace_period above FORCE_EXIT_MS", () => {
    const m = app.match(/^\s+stop_grace_period:\s*"?([0-9a-z.]+)"?\s*$/m);
    expect(m, "sentinel service has no stop_grace_period").not.toBeNull();
    const graceS = composeDurationSeconds(m![1]);
    expect(graceS * 1000).toBeGreaterThan(FORCE_EXIT_MS);
    expect(graceS * 1000).toBeGreaterThan(DRAIN_BUDGET_MS);
    expect(graceS).toBe(CONTAINER_STOP_GRACE_S);
  });

  it("does not unset NEXT_MANUAL_SIG_HANDLE for the app", () => {
    const m = app.match(/NEXT_MANUAL_SIG_HANDLE:\s*"?([^"\n]*)"?/);
    if (m) expect(m[1]).toMatch(/^(true|1)$/);
  });
});

describe("podman stop commands", () => {
  const files = ["scripts/rotate-secrets.sh", ".github/workflows/deploy.yml"];
  for (const f of files) {
    it(`${f}: every podman stop passes -t above FORCE_EXIT_MS`, () => {
      const lines = read(f)
        .split("\n")
        .filter((l) => /\bpodman stop\b|\$PODMAN stop\b/i.test(l) && !l.trim().startsWith("#"));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        const m = l.match(/stop\s+-t\s+(\d+)/);
        expect(m, `no -t on: ${l.trim()}`).not.toBeNull();
        expect(Number(m![1]) * 1000).toBeGreaterThan(FORCE_EXIT_MS);
      }
    });
  }
});

describe("instrumentation.ts", () => {
  const src = read("src/instrumentation.ts");

  it("derives the force exit from shutdown-config, not a literal", () => {
    expect(src).toContain("FORCE_EXIT_MS");
    expect(src).not.toMatch(/\},\s*8000\)/);
  });

  it("checks that it is the only SIGTERM listener", () => {
    expect(src).toMatch(/process\.listenerCount\(\s*"SIGTERM"\s*\)/);
  });
});
