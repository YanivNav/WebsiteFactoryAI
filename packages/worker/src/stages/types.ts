/**
 * The contract every stage handler obeys.
 *
 * A stage reads project state, performs work, stores artifacts, and reports what
 * happened. Nothing else. Stages are independent and know nothing about each other —
 * the machine, not the handler, decides what runs next.
 *
 * THE RULE THAT MAKES ALL OF THIS WORK:
 *
 *   Every stage must be deterministic from its inputs.
 *
 * `GenerateCode` depends only on the approved specification, the approved design, the
 * current repository state, and its configuration. NOT on hidden conversational
 * context, NOT on what some previous prompt happened to say. Rerun it tomorrow with
 * the same inputs and it behaves the same way.
 *
 * That single principle is what makes retries, debugging, versioning, and the eventual
 * move to Trigger.dev tractable. Every artifact records `promptHash` and `inputsHash`
 * precisely so a violation is *detectable* rather than mysterious. Do not smuggle
 * state in through the side door.
 */

import type { ProjectMode, Stage } from "@factory/shared";
import type { GitHubProject, ProjectId, ProjectStore } from "../store";

export interface StageContext {
  projectId: ProjectId;
  projectTitle: string;
  stage: Stage;
  brief: string;
  mode: ProjectMode;
  settings: {
    publishTarget: string;
    businessName?: string;
    siteTemplate?: string;
  };
  attempts: number;
  planningCycle?: number;
  wix?: { projectId?: string; siteId: string; appId: string };
  store: ProjectStore;

  /** Structured logging. Never rely on raw AI messages for state — log explicitly. */
  log(message: string, data?: Record<string, unknown>): Promise<void>;

  /** Report determinate progress for the current unit of work. */
  progress(percent: number, label: string): Promise<void>;

  /** Append-only. Emitting a `specification` also opens the review gate for it. */
  emitArtifact(
    type: ArtifactTypeName,
    data: unknown,
    provenance: Provenance,
  ): Promise<{ id: string; version: number }>;
}

/**
 * Where an artifact came from. Required, not optional — that is deliberate.
 *
 * If provenance were optional it would quietly default to nothing, and the
 * determinism guarantee would erode one convenient omission at a time. Making it
 * mandatory forces a stage that has no real provenance to say so out loud (see
 * `FAKE_PROVENANCE`), which keeps the fakes visibly fake.
 */
export interface Provenance {
  /** sha256 of the prompt file used. Empty only for stages that use no prompt. */
  promptHash: string;
  /** sha256 of the exact inputs the stage resolved. */
  inputsHash: string;
}

export type ArtifactTypeName =
  | "brief"
  | "questions"
  | "answers"
  | "businessRequirements"
  | "wixCapabilitySnapshot"
  | "wixSolutionArchitecture"
  | "implementationPlan"
  | "specification"
  | "design"
  | "buildReport"
  | "preview"
  | "websiteQaPlan"
  | "websiteQaReport"
  | "releaseReport";

export type StageResult =
  /** Work done. The machine resolves the actual next stage via `nextStage()`. */
  | { kind: "advance" }
  /** Feedback analysis may deliberately return to an earlier work stage. */
  | { kind: "route"; next: Stage }
  /** Empty question sets skip the human gate; non-empty sets wait for answers. */
  | { kind: "questions"; hasQuestions: boolean }
  /** Provisioning commits the Wix identity and next stage in one project write. */
  | {
      kind: "wixProvisioned";
      wix: { projectId?: string; siteId: string; appId: string };
      github: GitHubProject;
    }
  | { kind: "codeGenerated"; github: GitHubProject }
  /** Browser QA passed; atomically expose the tested preview for final review. */
  | {
      kind: "websiteQaCompleted";
      previewArtifactId: string;
      previewVersion: number;
      previewUrl: string;
    }
  /** Blocked on a human. Raises tasks and parks the project in WaitingForManualActions. */
  | { kind: "manualTasks"; checklistKey: string; tasks: ManualTaskDraft[] }
  /** Failed. The lease is released and the stage becomes leasable again. */
  | { kind: "failed"; error: string; retryable: boolean };

export interface ManualTaskDraft {
  /** Stable within one checklist so retries preserve completion without matching prose. */
  taskKey: string;
  title: string;
  description: string;
  /** Deep link into the exact Wix dashboard page. The user knows the Wix dashboard
   *  cold — send them somewhere they recognise, never "run this command". */
  wixDashboardUrl?: string;
  blocking: boolean;
  /** Present only when the task must collect a real dashboard-created runtime value. */
  configuration?: {
    key: string;
    label: string;
    placeholder?: string;
    instructions: string[];
    expectedFields?: Array<{ name: string; description: string }>;
  };
}

export interface StageHandler {
  readonly stage: Stage;
  run(ctx: StageContext): Promise<StageResult>;
}
