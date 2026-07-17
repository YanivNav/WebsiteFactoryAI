import type { Stage } from "@factory/shared";

export const PROJECT_PHASES: Array<{
  id: string;
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
