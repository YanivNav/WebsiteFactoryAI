import type { Stage } from "@factory/shared";

export type ReturnPhase =
  "sitePlan" | "visualDesign" | "wixSetup" | "siteBuild" | "finalReview" | "publishing";

export const PROJECT_PHASES: Array<{
  id: ReturnPhase;
  label: string;
  startStage: Stage;
}> = [
  { id: "sitePlan", label: "Site plan", startStage: "GeneratingQuestions" },
  { id: "visualDesign", label: "Visual design", startStage: "GeneratingDesign" },
  { id: "wixSetup", label: "Wix setup", startStage: "ProvisioningWix" },
  { id: "siteBuild", label: "Site build", startStage: "GeneratingCode" },
  { id: "finalReview", label: "Final review", startStage: "GeneratingPreview" },
  { id: "publishing", label: "Publishing", startStage: "Publishing" },
];
