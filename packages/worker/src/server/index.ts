import type {Artifact, ArtifactData, ArtifactType, Stage} from "@factory/shared";

/** IDs are opaque strings at the worker boundary. */
export type ProjectId = string;

export interface LeasedProject {
  id: ProjectId;
  title: string;
  currentStage: Stage;
  settings: {
    mode: "simple" | "developer";
    publishTarget: string;
  };
  attempts: number;
}

export type CommittedResult =
  { kind: "advance"; next: Stage } | { kind: "failed"; error: string };

/**
 * The worker's persistence port. Keep it limited to scheduling concerns until a real
 * stage needs another capability.
 */
export interface ServerAccess {
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
  getLatestArtifact<T extends ArtifactType>(projectId: ProjectId, artifactType: T): Promise<Artifact<T> | null>;
  setProgress(projectId: ProjectId, percent: number): Promise<void>;
  addArtifact<T extends ArtifactType>(projectId: ProjectId, type: T, data: ArtifactData<T>): Promise<Artifact<T>>;
  updateArtifact<T extends ArtifactType>(artifactId: string, data: ArtifactData<T>): Promise<Artifact<T>>;
}
