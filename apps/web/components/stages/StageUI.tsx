import {ComponentType} from "react";
import {ProjectDetail} from "@/data/useProjectDetail";
import { Stage } from "@factory/shared";
import {SimpleProgressStage} from "@/components/stages/SimpleProgressStage";
import {QuestionsStage} from "@/components/stages/QuestionsStage";

export interface StageViewProps {
  detail: ProjectDetail;
}

export const STAGE_VIEWS: Partial<Record<Stage, ComponentType<StageViewProps>>> = {
  GeneratingQuestions: SimpleProgressStage,
  WaitingForAnswers: QuestionsStage
};

export function EmptyStageView() {
  return <div className="m-8 text-2xl">Coming Soon</div>
}