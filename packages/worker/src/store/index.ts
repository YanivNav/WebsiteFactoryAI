/**
 * The state layer, behind one interface — the third port, alongside `JobRunner`
 * (where work runs) and `Workspace` (where files live).
 *
 *   V1 → ConvexProjectStore
 *   V2 → PostgresProjectStore   (Neon + Drizzle, if we ever move)
 *
 * THE WORKER MUST NEVER IMPORT CONVEX — except inside `./convex.ts`, which is the
 * adapter. Not once, not "just for this one query". All state access goes through
 * this port.
 *
 * Why this specific line: all the business logic lives in the worker, so the worker
 * is the only place portability actually costs anything. The dashboard is *allowed*
 * to use Convex hooks directly — live-updating queries are the whole reason we chose
 * Convex, and hiding them behind an abstraction would throw away the benefit. So the
 * blast radius of a future migration is: implement this interface against Postgres,
 * and rewrite the dashboard's data hooks. The state machine, the stage handlers, and
 * the services never notice.
 *
 * Corollary, and it matters: **Convex functions stay dumb.** CRUD plus the atomic
 * lease, and nothing else. The moment business logic leaks into a Convex mutation,
 * the Postgres port stops being a mechanical translation and becomes a rewrite.
 */

import type { ArtifactType, Stage } from "@factory/shared";
import type { StageResult } from "../stages/types.js";

/** IDs are opaque strings at this boundary. Never leak `Id<"projects">` past it. */
export type ProjectId = string;
export type ArtifactId = string;

export interface LeasedProject {
  id: ProjectId;
  currentStage: Stage;
  brief: string;
  settings: { mode: "simple" | "developer"; publishTarget: string };
  attempts: number;
}

export interface ArtifactRecord {
  id: ArtifactId;
  type: ArtifactType;
  version: number;
  data: unknown;
}

/** What `commitResult` records. `advance` carries the stage the worker computed. */
export type CommittedResult =
  | { kind: "advance"; next: Stage }
  | { kind: "manualTasks"; tasks: unknown[] }
  | { kind: "failed"; error: string };

export interface ProjectStore {
  // ── the queue ──────────────────────────────────────────────────────────────
  /**
   * Atomically claim one project sitting in a runnable stage. Must be a single
   * transaction — read-then-conditional-write — or two workers execute the same
   * stage. Returns null when there is nothing to do.
   *
   * An EXPIRED lease is reclaimable, and that is the entire crash-recovery story:
   * a worker that dies mid-stage simply lets its lease go stale, and the next worker
   * picks the project up where it was. No cleanup job, no orphan detection.
   */
  leaseNextRunnable(workerId: string, ttlSeconds: number): Promise<LeasedProject | null>;

  /** Long stages must keep their lease alive or they will be reclaimed mid-flight. */
  renewLease(projectId: ProjectId, workerId: string): Promise<void>;

  /**
   * Record the outcome of exactly one stage AND release the lease, atomically.
   *
   * These are one operation on purpose. Splitting them would open a window where the
   * project is unleased but its result is not yet written — and another worker would
   * happily redo the stage.
   */
  commitResult(projectId: ProjectId, workerId: string, result: CommittedResult): Promise<void>;

  // ── artifacts (append-only; never overwrite) ───────────────────────────────
  appendArtifact(input: {
    projectId: ProjectId;
    type: ArtifactType;
    data: unknown;
    promptHash: string;
    inputsHash: string;
  }): Promise<ArtifactRecord>;
  getLatestApproved(projectId: ProjectId, type: ArtifactType): Promise<ArtifactRecord | null>;
  getLatestArtifact(projectId: ProjectId, type: ArtifactType): Promise<ArtifactRecord | null>;
  getLatestReviewComments(projectId: ProjectId, type: ArtifactType): Promise<string[]>;
  getLatestReviewContext(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<{ comments: string[]; artifact: ArtifactRecord } | null>;

  // ── blobs ──────────────────────────────────────────────────────────────────
  /** Never inline a blob into a document. Store it, keep the id. */
  putBlob(bytes: Uint8Array, contentType: string): Promise<string>;

  // ── logs (separate table, append-only — the Convex OCC guardrail) ──────────
  appendLog(input: {
    projectId: ProjectId;
    stage: Stage;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;

  // ── manual tasks ───────────────────────────────────────────────────────────
  hasBlockingIncompleteTasks(projectId: ProjectId): Promise<boolean>;

  // ── change requests (the collaboration queue) ──────────────────────────────
  nextQueuedChangeRequest(
    projectId: ProjectId,
  ): Promise<{ id: string; description: string } | null>;
  completeChangeRequest(changeRequestId: string, status: "done" | "failed"): Promise<void>;
}

export type { StageResult };
