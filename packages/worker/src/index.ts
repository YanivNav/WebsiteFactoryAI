/**
 * The background build worker.
 *
 * It does exactly one thing: advance projects. It leases a runnable project from
 * Convex, executes a single stage, writes the result back, and releases the lease.
 * Nothing else.
 *
 * The worker PULLS work from Convex. It needs no inbound network address — no
 * webhook, no tunnel, no open port. That is why the dashboard can live on Vercel
 * while this process runs on a laptop (V1) or in a container (Phase 5) without a
 * single line of business logic changing between the two.
 *
 * PHASE 0: this starts, idles, and shuts down cleanly. It does no work.
 */

import "dotenv/config";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const WORKER_ID = process.env.WORKER_ID ?? "local-dev";

let running = true;

async function tick(): Promise<void> {
  // TODO(phase-1): the entire loop body.
  //
  //   const project = await convex.mutation(api.worker.leaseNextRunnable, {
  //     workerId: WORKER_ID,
  //     leaseTtlSeconds: LEASE_TTL_SECONDS,
  //   });
  //   if (!project) return;                       // nothing runnable — idle
  //
  //   const result = await dispatch(project);     // run exactly one stage
  //   await convex.mutation(api.worker.commitResult, { ... });
  //
  // The lease is atomic, so two workers can never execute the same project. That
  // same serialization is what makes the change-request queue conflict-free.
}

async function main(): Promise<void> {
  console.log(`[worker ${WORKER_ID}] started — idling (no stages implemented yet)`);

  const shutdown = (signal: string) => {
    console.log(`[worker ${WORKER_ID}] ${signal} — shutting down`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    try {
      await tick();
    } catch (error) {
      // A crash here must never lose work. The lease expires and another tick
      // (or another worker) reclaims the project exactly where it left off.
      console.error(`[worker ${WORKER_ID}] tick failed:`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log(`[worker ${WORKER_ID}] stopped`);
}

void main();
