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

import type { ArtifactType, DesignScreenProgress, ReviewFeedback, Stage } from "@factory/shared";
import type { StageResult } from "../stages";

/** IDs are opaque strings at this boundary. Never leak `Id<"projects">` past it. */
export type ProjectId = string;
export type ArtifactId = string;

export interface LeasedProject {
  id: ProjectId;
  title: string;
  currentStage: Stage;
  brief: string;
  settings: {
    mode: "simple" | "developer";
    publishTarget: string;
    businessName?: string;
    siteTemplate?: string;
  };
  attempts: number;
  planningCycle?: number;
  wix?: { projectId?: string; siteId: string; appId: string };
}

export interface ArtifactRecord {
  id: ArtifactId;
  type: ArtifactType;
  version: number;
  data: unknown;
  planningCycle?: number;
}

/** What `commitResult` records. `advance` carries the stage the worker computed. */
export type CommittedResult =
  | { kind: "advance"; next: Stage }
  | {
      kind: "wixProvisioned";
      next: Stage;
      wix: { projectId?: string; siteId: string; appId: string };
      github: GitHubProject;
    }
  | { kind: "codeGenerated"; next: Stage; github: GitHubProject }
  | {
      kind: "websiteQaCompleted";
      next: Stage;
      previewArtifactId: ArtifactId;
      previewVersion: number;
      previewUrl: string;
    }
  | { kind: "manualTasks"; checklistKey: string; tasks: unknown[] }
  | { kind: "failed"; error: string; retryable: boolean };

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
    planningCycle?: number;
  }): Promise<ArtifactRecord>;
  getLatestApproved(projectId: ProjectId, type: ArtifactType): Promise<ArtifactRecord | null>;
  getLatestArtifact(projectId: ProjectId, type: ArtifactType): Promise<ArtifactRecord | null>;
  getLatestReviewFeedback(projectId: ProjectId, type: ArtifactType): Promise<ReviewFeedback[]>;
  getLatestReviewContext(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<{ feedback: ReviewFeedback[]; artifact: ArtifactRecord } | null>;
  /** Mark the latest feedback as applied so a later lifecycle pass cannot replay it. */
  consumeLatestReviewFeedback(projectId: ProjectId, type: ArtifactType): Promise<void>;

  // ── design progress (live per-screen state the dashboard renders directly) ──
  /** Begin (or redo, after a crash) a design run: replace all rows with the plan. */
  resetDesignProgress(projectId: ProjectId, screens: DesignScreenProgress[]): Promise<void>;
  /** Move one screen through queued → generating → ready. Upserts by page path. */
  updateDesignProgress(projectId: ProjectId, screen: DesignScreenProgress): Promise<void>;

  // ── blobs ──────────────────────────────────────────────────────────────────
  /** Never inline a blob into a document. Store it, keep the id. */
  putBlob(bytes: Uint8Array, contentType: string): Promise<string>;
  getBlob(storageId: string): Promise<{ bytes: Uint8Array; contentType: string }>;

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
  /** Make one generated checklist current and retire tasks from older planning inputs. */
  activateManualTaskChecklist(projectId: ProjectId, checklistKey: string): Promise<void>;
  getManualTaskStatuses(
    projectId: ProjectId,
    checklistKey: string,
  ): Promise<
    Array<{
      taskKey: string;
      completed: boolean;
      configurationKey?: string;
      configurationValue?: string;
    }>
  >;

  // ── change requests (the collaboration queue) ──────────────────────────────
  nextQueuedChangeRequest(
    projectId: ProjectId,
  ): Promise<{ id: string; description: string } | null>;
  completeChangeRequest(changeRequestId: string, status: "done" | "failed"): Promise<void>;
}

export interface GitHubProject {
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
}

export type { StageResult };
