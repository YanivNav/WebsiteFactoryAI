/**
 * The background build worker.
 *
 * It does exactly one thing: lease queued work, execute it, persist its result,
 * and release the lease.
 *
 * The worker PULLS work from Convex. It needs no inbound network address — no
 * webhook, no tunnel, no open port. That is why the dashboard can live on Vercel
 * while this process runs on a laptop (V1) or in a container (Phase 5) without a
 * single line of business logic changing between the two.
 *
 * Kill this process at any moment. Nothing is lost: all progress lives in the store,
 * never in memory, and an abandoned lease simply goes stale and gets reclaimed.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ConvexServer } from "./server/convex.js";
import { LocalRunner } from "./runner/local.js";
import { getDevServerManager } from "./services/dev-server.js";

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
const WORKER_INSTANCE_ID = `${WORKER_ID}:${randomUUID()}`;
const LEASE_TTL_SECONDS = Number(process.env.LEASE_TTL_SECONDS ?? 300);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);

if (!CONVEX_URL) {
  console.error("CONVEX_URL is not set. Run `pnpm convex` first.");
  process.exit(1);
}

let running = true;

async function main(): Promise<void> {
  const store = new ConvexServer(CONVEX_URL!, LEASE_TTL_SECONDS);
  const runner = new LocalRunner(store, WORKER_INSTANCE_ID, LEASE_TTL_SECONDS);
  // Long-lived dev servers live outside the work loop; give the manager the store.
  getDevServerManager().configure(store);

  console.error(`[worker ${WORKER_INSTANCE_ID}] started — polling ${CONVEX_URL}`);

  const shutdown = (signal: string) => {
    console.error(`[worker ${WORKER_INSTANCE_ID}] ${signal} — shutting down`);
    // A lost dev server is a cache, not state — stop them all cleanly.
    getDevServerManager().stopAll();
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
      console.error(`[worker ${WORKER_INSTANCE_ID}] tick failed:`, error);
    }

    // Busy → poll again straight away. Idle → back off.
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.error(`[worker ${WORKER_INSTANCE_ID}] stopped`);
}

void main();
