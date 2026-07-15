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
import type { ProjectId, ProjectStore } from "../store/index.js";

export interface StageContext {
  projectId: ProjectId;
  stage: Stage;
  brief: string;
  mode: ProjectMode;
  attempts: number;
  store: ProjectStore;

  /** Structured logging. Never rely on raw AI messages for state — log explicitly. */
  log(message: string, data?: Record<string, unknown>): Promise<void>;

  /** Append-only. Emitting a `specification` also opens the review gate for it. */
  emitArtifact(type: ArtifactTypeName, data: unknown, provenance: Provenance): Promise<void>;
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
  | "specification"
  | "design"
  | "buildReport"
  | "preview"
  | "releaseReport";

export type StageResult =
  /** Work done. The machine resolves the actual next stage via `nextStage()`. */
  | { kind: "advance" }
  /** Empty question sets skip the human gate; non-empty sets wait for answers. */
  | { kind: "questions"; hasQuestions: boolean }
  /** Blocked on a human. Raises tasks and parks the project in WaitingForManualActions. */
  | { kind: "manualTasks"; tasks: ManualTaskDraft[] }
  /** Failed. The lease is released and the stage becomes leasable again. */
  | { kind: "failed"; error: string };

export interface ManualTaskDraft {
  title: string;
  description: string;
  /** Deep link into the exact Wix dashboard page. The user knows the Wix dashboard
   *  cold — send them somewhere they recognise, never "run this command". */
  wixDashboardUrl?: string;
  blocking: boolean;
}

export interface StageHandler {
  readonly stage: Stage;
  run(ctx: StageContext): Promise<StageResult>;
}
