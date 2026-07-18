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

export const WORK_DEFINITIONS = {
  generateQuestions: {
    inputs: { brief: "brief" },
  },
  generateSpecification: {
    inputs: {
      brief: "brief",
      questionnaire: "questionnaire",
      questionnaireResponse: "questionnaireResponse",
    },
  },
  generateDesign: {
    inputs: { specification: "specification" },
  },
} as const satisfies Record<string, { inputs: Record<string, ArtifactType> }>;

export type WorkOperation = keyof typeof WORK_DEFINITIONS;
import type { ArtifactType } from "./artifacts";
