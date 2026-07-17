import {ComponentType} from "react";
import {ProjectDetail} from "@/data/useProjectDetail";
import { Stage } from "@factory/shared";
import {SimpleProgressStage} from "@/components/stages/SimpleProgressStage";

export interface StageViewProps {
  detail: ProjectDetail;
}

export const STAGE_VIEWS: Partial<Record<Stage, ComponentType<StageViewProps>>> = {
  GeneratingQuestions: SimpleProgressStage
};