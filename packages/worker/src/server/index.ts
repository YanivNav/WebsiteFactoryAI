import type {
  Artifact,
  ArtifactData,
  ArtifactType,
  GenerationRequest,
  Stage,
} from "@factory/shared";

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
  generationRequest?: GenerationRequest;
}

export type CommittedResult =
  | { kind: "advance"; next: Stage }
  | {
      kind: "awaitArtifact";
      next: Stage;
      artifactId: string;
      gateKind: "answers" | "review";
    }
  | { kind: "failed"; error: string };

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
  getCurrentArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    artifactType: T,
  ): Promise<Artifact<T> | null>;
  getArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    artifactId: string,
  ): Promise<Artifact<T> | null>;
  setProgress(projectId: ProjectId, percent: number): Promise<void>;
  addArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    type: T,
    data: ArtifactData<T>,
    sourceArtifactId?: string,
    generationRequestId?: string,
  ): Promise<Artifact<T>>;
}
