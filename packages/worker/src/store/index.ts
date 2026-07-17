import type { Stage } from "@factory/shared";

/** IDs are opaque strings at the worker boundary. */
export type ProjectId = string;

export interface LeasedProject {
  id: ProjectId;
  title: string;
  currentStage: Stage;
  brief: string;
  settings: {
    mode: "simple" | "developer";
    publishTarget: string;
  };
  attempts: number;
}

export type CommittedResult =
  { kind: "advance"; next: Stage } | { kind: "failed"; error: string; retryable: boolean };

/**
 * The worker's persistence port. Keep it limited to scheduling concerns until a real
 * stage needs another capability.
 */
export interface ProjectStore {
  leaseNextRunnable(workerId: string, ttlSeconds: number): Promise<LeasedProject | null>;
  renewLease(projectId: ProjectId, workerId: string): Promise<void>;
  commitResult(projectId: ProjectId, workerId: string, result: CommittedResult): Promise<void>;
  appendLog(input: {
    projectId: ProjectId;
    stage: Stage;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
}
