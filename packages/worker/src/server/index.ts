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

/** The subset of a work context that build services (code gen, Wix CLI) need. */
export interface BuildContext {
  log(level: "info" | "warn" | "error", message: string): void;
  getFileUrl(storageId: string): Promise<string | null>;
  progress(percent: number, message: string, data?: unknown): void;
}

export type WorkRevision = {
  mode: "initial" | "regenerate" | "revise";
  baseArtifactId?: string;
  feedback?: string;
  /** When set, the revision targets a single design screen (by page path). */
  screenPath?: string;
  /** When set, a site-build revision bakes in this owner-content artifact. */
  contentArtifactId?: string;
};

/** One line of streamed dev-server output. */
export type DevLogLine = { stream: "out" | "err"; line: string };
export type DevSessionStatus = "starting" | "running" | "stopped" | "error";

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
  | { type: "completeAndSetReady"; devUrl?: string; previewUrl?: string; previewDashboardUrl?: string; liveUrl?: string; dashboardUrl?: string }
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

// ---- Site actions (control-panel management) ---------------------------------

export type SiteActionType =
  | "changeRequest"
  | "cleanRebuild"
  | "revertToCommit"
  | "revertSiteTo"
  | "applyContent"
  | "screenChange"
  | "preview"
  | "startDev"
  | "stopDev"
  | "publish";

export type LeasedSiteAction = {
  id: string;
  projectId: ProjectId;
  projectTitle: string;
  type: SiteActionType;
  data: Record<string, unknown>;
  approvedArtifactIds: Record<string, string>;
  settings: { mode: "simple" | "developer"; publishTarget: string };
};

export type SiteActionCompletion = {
  liveUrl?: string;
  previewUrl?: string;
  dashboardUrl?: string;
  previewDashboardUrl?: string;
  devUrl?: string;
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

  // ---- Dev server: a long-lived session, decoupled from the work loop -------
  /** Begin a dev session for a project (resets its state and clears old logs). */
  startDevSession(input: { projectId: ProjectId; workerId: string }): Promise<void>;
  /** Update a dev session's status/url as the server starts, serves, or exits. */
  updateDevSession(input: {
    projectId: ProjectId;
    workerId: string;
    status: DevSessionStatus;
    url?: string;
    exitReason?: string;
  }): Promise<void>;
  /** Append a batch of streamed dev-server log lines. */
  appendDevLogs(input: {
    projectId: ProjectId;
    workerId: string;
    lines: DevLogLine[];
  }): Promise<void>;

  // ---- Site actions ---------------------------------------------------------
  leaseNextSiteAction(workerId: string, ttlSeconds: number): Promise<LeasedSiteAction | null>;
  completeSiteAction(siteActionId: string, workerId: string, completion: SiteActionCompletion): Promise<void>;
  failSiteAction(siteActionId: string, workerId: string, error: string, technicalDetails?: string): Promise<void>;
  appendSiteActionLog(input: {
    projectId: ProjectId;
    siteActionId: string;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  addSiteActionArtifact<T extends ArtifactType>(input: {
    projectId: ProjectId;
    siteActionId: string;
    workerId: string;
    outputKey: string;
    type: T;
    data: ArtifactData<T>;
    basedOnArtifactId?: string;
    assets?: ArtifactAsset[];
  }): Promise<Artifact<T>>;
  generateSiteActionUploadUrl(siteActionId: string, workerId: string): Promise<string>;
}
