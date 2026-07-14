/**
 * The state layer, behind one interface — the third port, alongside `JobRunner`
 * (where work runs) and `Workspace` (where files live).
 *
 *   V1 → ConvexProjectStore
 *   V2 → PostgresProjectStore   (Neon + Drizzle, if we ever move)
 *
 * THE WORKER MUST NEVER IMPORT CONVEX. Not once, not "just for this one query".
 * All state access goes through this port.
 *
 * Why this specific line: all the business logic lives in the worker, so the worker
 * is the only place portability actually costs anything. The dashboard is *allowed*
 * to use Convex hooks directly — live-updating queries are the whole reason we chose
 * Convex, and hiding them behind an abstraction would throw away the benefit. So the
 * blast radius of a future migration is: implement this interface against Postgres,
 * and rewrite the dashboard's data-fetching hooks. The state machine, the stage
 * handlers, and the services never notice.
 *
 * Corollary, and it matters: **Convex functions stay dumb.** CRUD plus the atomic
 * lease, and nothing else. The moment business logic leaks into a Convex mutation,
 * the Postgres port stops being a mechanical translation and becomes a rewrite.
 *
 * PHASE 1. Not implemented.
 */

import type { ArtifactType, Stage } from "@factory/shared";

/** IDs are opaque strings at this boundary. Never leak `Id<"projects">` past it. */
export type ProjectId = string;
export type ArtifactId = string;

export interface LeasedProject {
  id: ProjectId;
  currentStage: Stage;
  brief: string;
  settings: Record<string, unknown>;
  attempts: number;
}

export interface ArtifactRecord {
  id: ArtifactId;
  type: ArtifactType;
  version: number;
  data: unknown;
}

export interface ProjectStore {
  // ── the queue ──────────────────────────────────────────────────────────────
  /**
   * Atomically claim one project sitting in a runnable stage. Must be a single
   * transaction: read-then-conditional-write, or two workers execute the same
   * stage. Returns null when there is nothing to do.
   *
   * This same serialization is what makes the change-request queue conflict-free —
   * there is only ever one writer per project.
   */
  leaseNextRunnable(workerId: string, ttlSeconds: number): Promise<LeasedProject | null>;
  renewLease(projectId: ProjectId, workerId: string): Promise<void>;
  releaseLease(projectId: ProjectId, workerId: string): Promise<void>;

  // ── state transitions ──────────────────────────────────────────────────────
  advanceStage(projectId: ProjectId, next: Stage): Promise<void>;
  recordFailure(projectId: ProjectId, error: string): Promise<void>;

  // ── artifacts (append-only; never overwrite) ───────────────────────────────
  appendArtifact(input: {
    projectId: ProjectId;
    type: ArtifactType;
    data: unknown;
    promptHash: string;
    inputsHash: string;
    storageId?: string;
  }): Promise<ArtifactRecord>;
  getLatestApproved(projectId: ProjectId, type: ArtifactType): Promise<ArtifactRecord | null>;

  // ── blobs (Stitch HTML/screenshots, raw build output) ──────────────────────
  /** Never inline a blob into a document. Store it, keep the id. */
  putBlob(bytes: Uint8Array, contentType: string): Promise<string>;

  // ── logs (separate table, append-only — see the OCC guardrail in CLAUDE.md) ─
  appendLog(input: {
    projectId: ProjectId;
    stage: Stage;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;

  // ── manual tasks ───────────────────────────────────────────────────────────
  createManualTasks(projectId: ProjectId, tasks: unknown[]): Promise<void>;
  hasBlockingIncompleteTasks(projectId: ProjectId): Promise<boolean>;

  // ── change requests (the collaboration queue) ──────────────────────────────
  nextQueuedChangeRequest(projectId: ProjectId): Promise<{ id: string; description: string } | null>;
}

// TODO(phase-1): ConvexProjectStore implements ProjectStore.
// TODO(v2):      PostgresProjectStore implements ProjectStore.
