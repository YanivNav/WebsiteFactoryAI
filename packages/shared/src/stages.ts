/**
 * The stage vocabulary. One definition, imported by both the dashboard and the worker.
 *
 * The central scheduling rule of the whole system lives here:
 *
 *   `Waiting*` stages are NOT runnable.
 *
 * The worker only ever leases a project sitting in a *work* stage. An approval
 * mutation flips the stage to the next work stage, and the worker picks it up on
 * its next tick. Human-in-the-loop therefore falls out of the data model for free —
 * there is no pause/resume code anywhere in this codebase, and there must never be.
 */

export const STAGES = [
  "Draft",
  "GeneratingSpecification",
  "WaitingForSpecificationApproval",
  "GeneratingDesign",
  "WaitingForDesignApproval",
  "ProvisioningWix",
  "WaitingForManualActions",
  "GeneratingCode",
  "WaitingForCodeReview",
  "RunningChecks",
  "GeneratingPreview",
  "WaitingForFinalApproval",
  "Publishing",
  "Completed",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Stages where the system waits on a human. The worker never leases these.
 * `Completed` is included deliberately: it is a *resting* state, not a terminal
 * one — a ChangeRequest sends the project back to `GeneratingCode`.
 */
export const WAITING_STAGES = [
  "Draft",
  "WaitingForSpecificationApproval",
  "WaitingForDesignApproval",
  "WaitingForManualActions",
  "WaitingForCodeReview",
  "WaitingForFinalApproval",
  "Completed",
] as const satisfies readonly Stage[];

export type WaitingStage = (typeof WAITING_STAGES)[number];

export function isWaitingStage(stage: Stage): stage is WaitingStage {
  return (WAITING_STAGES as readonly Stage[]).includes(stage);
}

/** A stage the worker is allowed to lease and execute. */
export function isRunnableStage(stage: Stage): boolean {
  return !isWaitingStage(stage);
}

/**
 * What the user sees. They are Wix-literate business people who cannot read code,
 * so the UI never says "artifact", "repository", "commit", "build", or "stage".
 * Internal enums stay precise; this is the only place they become human words.
 */
export const STAGE_LABELS: Record<Stage, string> = {
  Draft: "Draft",
  GeneratingSpecification: "Planning your site",
  WaitingForSpecificationApproval: "Review your site plan",
  GeneratingDesign: "Designing your site",
  WaitingForDesignApproval: "Review your design",
  ProvisioningWix: "Setting up your Wix site",
  WaitingForManualActions: "Action needed from you",
  GeneratingCode: "Building your site",
  WaitingForCodeReview: "Review the code",
  RunningChecks: "Building your site",
  GeneratingPreview: "Preparing your preview",
  WaitingForFinalApproval: "Review your site",
  Publishing: "Publishing",
  Completed: "Live",
};

/**
 * Review gates are a per-project policy, not hardcoded transitions.
 *
 * `simple` (the default) omits `WaitingForCodeReview` entirely: a Wix merchant
 * cannot approve a diff, but they can absolutely judge a rendered preview. So the
 * flow goes build → check → preview → approve-the-preview.
 *
 * `developer` enables the code gate. Both modes share one state machine.
 */
export type ProjectMode = "simple" | "developer";

// TODO(phase-1): transition table + gate policy resolution.
//   nextStage(current: Stage, mode: ProjectMode): Stage
// Deliberately not implemented during scaffolding.
