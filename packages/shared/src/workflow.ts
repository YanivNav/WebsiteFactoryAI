import type { ArtifactType } from "./artifacts";

export const PHASES = [
  "sitePlan",
  "visualDesign",
  "wixSetup",
  "siteBuild",
  "verification",
  "finalReview",
  "publishing",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  sitePlan: "Site plan",
  visualDesign: "Visual design",
  wixSetup: "Wix setup",
  siteBuild: "Site build",
  verification: "Verification",
  finalReview: "Final review",
  publishing: "Publishing",
};

export type ProjectMode = "simple" | "developer";
export const DEFAULT_MODE: ProjectMode = "simple";

export type UserTaskResult =
  | { type: "selectVersion" }
  | { type: "submitArtifact"; artifactType: ArtifactType };

/**
 * Everything the system needs to know about one pipeline stage. The pipeline
 * is: run the operation → open its review task on the produced artifact →
 * when the task completes, start `next`.
 *
 * This table is the single source of truth for the workflow. To add a stage:
 * add an entry here, register a handler for it in
 * `packages/worker/src/operations`, and (optionally) register views for its
 * artifact/progress in `ARTIFACT_PRESENTATIONS` / `OPERATION_PROGRESS_VIEWS`
 * in the web app. Convex (queueing, task completion, validation) and the
 * worker derive everything else from this definition.
 */
export interface WorkDefinition {
  /** Progress-timeline phase this operation belongs to. */
  phase: Phase;
  /** Label shown while the work is running. */
  label: string;
  /** Named inputs, resolved from approved artifacts when the work is queued. */
  inputs: Record<string, ArtifactType>;
  /** The artifact type this operation produces. */
  output: ArtifactType;
  /** The user task opened on the produced artifact. */
  review: { label: string; result: UserTaskResult };
  /** What runs after the review task completes. */
  next: WorkOperation | "completeProject";
}

export const WORK_DEFINITIONS = {
  generateQuestions: {
    phase: "sitePlan",
    label: "Reading your brief",
    inputs: { brief: "brief" },
    output: "questionnaire",
    review: {
      label: "A few quick questions",
      result: { type: "submitArtifact", artifactType: "questionnaireResponse" },
    },
    next: "generateSpecification",
  },
  generateSpecification: {
    phase: "sitePlan",
    label: "Planning your site",
    inputs: {
      brief: "brief",
      questionnaire: "questionnaire",
      questionnaireResponse: "questionnaireResponse",
    },
    output: "specification",
    review: { label: "Review your site plan", result: { type: "selectVersion" } },
    next: "generateDesign",
  },
  generateDesign: {
    phase: "visualDesign",
    label: "Designing your site",
    inputs: { specification: "specification" },
    output: "design",
    review: { label: "Review your site design", result: { type: "selectVersion" } },
    next: "planWixSetup",
  },
  planWixSetup: {
    phase: "wixSetup",
    label: "Choosing the right Wix setup",
    inputs: { specification: "specification" },
    output: "wixSetupPlan",
    review: {
      label: "Choose your Wix setup",
      result: { type: "submitArtifact", artifactType: "wixSetupDecision" },
    },
    next: "setupWix",
  },
  setupWix: {
    phase: "wixSetup",
    label: "Setting up your Wix site",
    inputs: { decision: "wixSetupDecision" },
    output: "wixProject",
    review: { label: "Your Wix site is ready", result: { type: "selectVersion" } },
    next: "completeProject",
  },
} as const;

export type WorkOperation = keyof typeof WORK_DEFINITIONS;
export type NextWork = WorkOperation | "completeProject";

/** The operation the pipeline starts with. */
export const FIRST_OPERATION: WorkOperation = "generateQuestions";

// `satisfies` can't be used on WORK_DEFINITIONS directly (WorkDefinition.next
// refers to the operation names, which come from the object's own keys), so
// validate the shape with a widened assignment instead.
const _validated: Record<WorkOperation, WorkDefinition> = WORK_DEFINITIONS;
void _validated;

/** The operation that produces each artifact type. */
export const OPERATION_FOR_OUTPUT = Object.fromEntries(
  (Object.keys(WORK_DEFINITIONS) as WorkOperation[]).map((operation) => [
    WORK_DEFINITIONS[operation].output,
    operation,
  ]),
) as Partial<Record<ArtifactType, WorkOperation>>;

/** The artifact type a review task in each phase reviews. */
export const PHASE_REVIEW_ARTIFACT = Object.fromEntries(
  (Object.values(WORK_DEFINITIONS) as WorkDefinition[])
    .filter((definition) => definition.review.result.type === "selectVersion")
    .map((definition) => [definition.phase, definition.output]),
) as Partial<Record<Phase, ArtifactType>>;
