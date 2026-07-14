/**
 * The background build worker.
 *
 * It does exactly one thing: advance projects. Lease a runnable project, execute a
 * single stage, write the result back, release the lease. Nothing else.
 *
 * The worker PULLS work from Convex. It needs no inbound network address — no
 * webhook, no tunnel, no open port. That is why the dashboard can live on Vercel
 * while this process runs on a laptop (V1) or in a container (Phase 5) without a
 * single line of business logic changing between the two.
 *
 * Kill this process at any moment. Nothing is lost: all progress lives in the store,
 * never in memory, and an abandoned lease simply goes stale and gets reclaimed.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ConvexProjectStore } from "./store/convex.js";
import { LocalRunner } from "./runner/local.js";

// Load env from the REPO ROOT, not the cwd.
//
// Two traps here, both of which bit us:
//   1. `pnpm worker` runs with cwd = packages/worker/, so a bare `dotenv/config`
//      looks for env files in the wrong directory entirely.
//   2. `npx convex dev` writes CONVEX_URL to `.env.local`, and dotenv defaults to
//      `.env` — so even in the right directory it would find nothing.
// Resolve from this file's own location and read both, explicitly.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: [path.join(repoRoot, ".env.local"), path.join(repoRoot, ".env")] });

const CONVEX_URL = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
const WORKER_ID = process.env.WORKER_ID ?? "local-dev";
const LEASE_TTL_SECONDS = Number(process.env.LEASE_TTL_SECONDS ?? 300);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);

if (!CONVEX_URL) {
  console.error("CONVEX_URL is not set. Run `pnpm convex` first.");
  process.exit(1);
}

let running = true;

async function main(): Promise<void> {
  const store = new ConvexProjectStore(CONVEX_URL!, LEASE_TTL_SECONDS);
  const runner = new LocalRunner(store, WORKER_ID, LEASE_TTL_SECONDS);

  console.log(`[worker ${WORKER_ID}] started — polling ${CONVEX_URL}`);

  const shutdown = (signal: string) => {
    console.log(`[worker ${WORKER_ID}] ${signal} — shutting down`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    let didWork = false;
    try {
      didWork = await runner.tick();
    } catch (error) {
      // A crash here must never lose work. The lease expires and the next tick — or
      // another worker entirely — reclaims the project exactly where it left off.
      console.error(`[worker ${WORKER_ID}] tick failed:`, error);
    }

    // Busy → poll again straight away. Idle → back off.
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log(`[worker ${WORKER_ID}] stopped`);
}

void main();
