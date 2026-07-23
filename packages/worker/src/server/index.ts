import {
  WORK_DEFINITIONS,
  type Artifact,
  type ArtifactData,
  type ArtifactType,
  type Phase,
  type WorkOperation,
} from "@factory/shared";

export type ProjectId = string;
export type WorkId = string;

export type WorkRevision = {
  mode: "initial" | "regenerate" | "revise";
  baseArtifactId?: string;
  feedback?: string;
  /** When set, the revision targets a single design screen (by page path). */
  screenPath?: string;
  /** When set, a site-build revision bakes in this owner-content artifact. */
  contentArtifactId?: string;
  /** When true, revert the generated code to the fresh scaffold before rebuilding. */
  cleanRebuild?: boolean;
  /** When set, restore the site's code to this git commit instead of generating. */
  revertToCommit?: string;
};

export type ArtifactAsset = {
  id: string;
  data: unknown;
  storageId: string;
};

export type ScreenRevisionRequest = {
  screenPath: string;
  feedback: string;
};

export type ArtifactInput<T extends ArtifactType> = {
  source: "artifact";
  artifactType: T;
  artifactId: string;
};

type InputArtifactType<
  K extends WorkOperation,
  N extends keyof (typeof WORK_DEFINITIONS)[K]["inputs"],
> = (typeof WORK_DEFINITIONS)[K]["inputs"][N] & ArtifactType;

type InputName<K extends WorkOperation> = keyof (typeof WORK_DEFINITIONS)[K]["inputs"];

export type WorkInstruction<K extends WorkOperation = WorkOperation> = {
  [Operation in K]: {
    type: Operation;
    inputs: {
      [Name in InputName<Operation>]: ArtifactInput<InputArtifactType<Operation, Name>>;
    };
    revision?: WorkRevision;
  };
}[K];

export type WorkDraft<K extends WorkOperation = WorkOperation> = {
  phase: Phase;
  label: string;
  instruction: WorkInstruction<K>;
};

export type UserTaskResult =
  { type: "selectVersion" } | { type: "submitArtifact"; artifactType: ArtifactType };

export type UserTaskDraft = {
  phase: Phase;
  label: string;
  subjectArtifactId: string;
  previousResultArtifactId?: string;
  result: UserTaskResult;
};

export type WorkCompletion =
  | { type: "completeProject" }
  | { type: "completeAndSetReady"; devUrl?: string; previewUrl?: string; liveUrl?: string; dashboardUrl?: string }
  | { type: "startWork"; work: WorkDraft }
  | { type: "createUserTask"; task: UserTaskDraft };

type LeasedWorkCommon = {
  id: WorkId;
  projectId: ProjectId;
  projectTitle: string;
  phase: Phase;
  label: string;
  attempt: number;
  settings: {
    mode: "simple" | "developer";
    publishTarget: string;
  };
};

export type LeasedWork<K extends WorkOperation = WorkOperation> = LeasedWorkCommon & {
  instruction: WorkInstruction<K>;
};

export interface ServerAccess {
  leaseNextWork(workerId: string, ttlSeconds: number): Promise<LeasedWork | null>;
  renewLease(workId: WorkId, workerId: string): Promise<void>;
  completeWork(workId: WorkId, workerId: string, completion: WorkCompletion): Promise<void>;
  failWork(
    workId: WorkId,
    workerId: string,
    error: string,
    technicalDetails?: string,
  ): Promise<void>;
  appendLog(input: {
    projectId: ProjectId;
    workId: WorkId;
    attempt: number;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  appendProgress(input: {
    projectId: ProjectId;
    workId: WorkId;
    workerId: string;
    attempt: number;
    percent: number;
    message: string;
    data?: unknown;
  }): Promise<void>;
  getArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    artifactId: string,
  ): Promise<Artifact<T> | null>;
  addArtifact<T extends ArtifactType>(input: {
    projectId: ProjectId;
    workId: WorkId;
    workerId: string;
    outputKey: string;
    type: T;
    data: ArtifactData<T>;
    basedOnArtifactId?: string;
    assets?: ArtifactAsset[];
  }): Promise<Artifact<T>>;
  /** Update an existing artifact's data in place (for revisions — git holds history). */
  updateArtifact<T extends ArtifactType>(input: {
    artifactId: string;
    workerId: string;
    data: ArtifactData<T>;
    assets?: ArtifactAsset[];
  }): Promise<Artifact<T>>;
  /** Upload a blob to file storage and return its storage id. */
  uploadBlob(
    workId: WorkId,
    workerId: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<string>;
  /** Claim pending per-screen revision requests raised while this work runs. */
  claimScreenRevisions(workId: WorkId, workerId: string): Promise<ScreenRevisionRequest[]>;
  /** Resolve a storage id to a download URL. */
  getFileUrl(storageId: string): Promise<string | null>;
}
