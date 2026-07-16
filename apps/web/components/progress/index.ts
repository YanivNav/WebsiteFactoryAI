/**
 * Stage-specific progress views, shown while the worker owns the project.
 *
 * To give a stage a richer live view than the default spinner: build a component
 * taking `StageProgressViewProps`, and register it here. Nothing else changes —
 * WorkingWorkspace looks the stage up and falls back to DefaultProgress.
 */

import type { ComponentType } from "react";
import type { Stage } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { DesignProgress } from "./DesignProgress";

export interface StageProgressViewProps {
  detail: ProjectDetail;
}

export const STAGE_PROGRESS_VIEWS: Partial<Record<Stage, ComponentType<StageProgressViewProps>>> =
  {
    GeneratingDesign: DesignProgress,
  };
