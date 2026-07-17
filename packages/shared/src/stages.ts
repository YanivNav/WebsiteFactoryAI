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
  "GeneratingQuestions",
  "WaitingForAnswers",
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
  "RunningWebsiteQA",
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
  "WaitingForAnswers",
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
  GeneratingQuestions: "Reading your brief",
  WaitingForAnswers: "A few quick questions",
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
  RunningWebsiteQA: "Testing your site",
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

export const DEFAULT_MODE: ProjectMode = "simple";

/**
 * Is this stage part of the linear flow for the given mode?
 *
 * Two stages are special:
 *
 * - `WaitingForCodeReview` exists only in `developer` mode. A Wix merchant cannot
 *   approve a diff, so in `simple` mode we skip straight from building to checking,
 *   and the human judges the rendered preview instead.
 *
 * - `WaitingForManualActions` is NEVER auto-entered. The linear flow always skips it.
 *   A project lands there only when a stage handler explicitly returns
 *   `{ kind: "manualTasks" }` — i.e. when the work actually turned out to need a
 *   human. If provisioning needs nothing from you, you are never asked for anything.
 */
function isStageInFlow(stage: Stage, mode: ProjectMode): boolean {
  if (stage === "WaitingForCodeReview") return mode === "developer";
  if (stage === "WaitingForManualActions") return false;
  return true;
}

/**
 * The transition table. `STAGES` is already declared in flow order, so "next" is
 * simply the next enabled stage — there is no separate graph to keep in sync.
 *
 * This is a PURE FUNCTION, deliberately. It is the one piece of stage logic that both
 * the worker and Convex need (the worker advances; an approval also advances), and
 * duplicating it would be how the two drift apart. Keeping it pure and in `shared`
 * means Convex mutations stay mechanical — see the portability guardrails in CLAUDE.md.
 *
 * `Completed` is a RESTING state, not a terminal one: it stays put here, and a
 * ChangeRequest is what sends the project back to `GeneratingCode`.
 */
export function nextStage(current: Stage, mode: ProjectMode = DEFAULT_MODE): Stage {
  if (current === "Completed") return "Completed";

  const index = STAGES.indexOf(current);
  if (index === -1) {
    throw new Error(`Unknown stage: ${current}`);
  }

  for (let i = index + 1; i < STAGES.length; i++) {
    const candidate = STAGES[i]!;
    if (isStageInFlow(candidate, mode)) return candidate;
  }

  return "Completed";
}
