/**
 * The contract every stage handler obeys.
 *
 * A stage reads project state, performs work, stores artifacts, and reports the
 * next stage. Nothing else. Stages are independent and know nothing about each
 * other — the machine, not the handler, decides what runs next.
 *
 * THE RULE THAT MAKES ALL OF THIS WORK:
 *
 *   Every stage must be deterministic from its inputs.
 *
 * `GenerateCode` depends only on the approved specification, the approved design,
 * the current repository state, and its configuration. It must NOT depend on hidden
 * conversational context or on what some previous prompt happened to say. Rerun it
 * tomorrow with the same inputs and it behaves the same way.
 *
 * That single principle is what makes retries, debugging, versioning, and the
 * eventual move to Trigger.dev tractable. Every artifact records `promptHash` and
 * `inputsHash` precisely so a violation of this rule is *detectable* rather than
 * mysterious. Do not smuggle state in through the side door.
 */

import type { Stage } from "@factory/shared";
import type { Workspace } from "../workspace/index.js";

export interface StageContext {
  projectId: string;
  /** Everything the stage is allowed to read, resolved explicitly up front. */
  inputs: Readonly<Record<string, unknown>>;
  workspace: Workspace;
  log(message: string, data?: Record<string, unknown>): Promise<void>;
  emitArtifact(type: string, data: unknown): Promise<void>;
}

export type StageResult =
  /** Work done — advance. The machine resolves the actual next stage via gate policy. */
  | { kind: "advance" }
  /** Blocked on a human. Raises tasks and parks the project in WaitingForManualActions. */
  | { kind: "manualTasks"; tasks: ManualTaskDraft[] }
  /** Failed. The machine decides whether to retry, self-heal, or escalate. */
  | { kind: "failed"; error: string };

export interface ManualTaskDraft {
  title: string;
  description: string;
  /** Deep link into the exact Wix dashboard page. Never "run this command" —
   *  the user knows the Wix dashboard, so send them somewhere they recognise. */
  wixDashboardUrl?: string;
  blocking: boolean;
}

export interface StageHandler {
  readonly stage: Stage;
  run(ctx: StageContext): Promise<StageResult>;
}
