/**
 * The stage registry — the worker's dispatch table.
 *
 * Only *runnable* stages appear here. `Waiting*` stages have no handler BY DESIGN:
 * they are not things the worker does, they are things the worker declines to do.
 * That absence is the entire human-in-the-loop mechanism, and it is why no
 * pause/resume code exists anywhere in this codebase.
 */

import type { Stage } from "@factory/shared";
import type { StageHandler } from "./types.js";

import { generateSpecification } from "./generateSpecification.js";
import { generateQuestions } from "./generateQuestions.js";
import { generateDesign } from "./generateDesign.js";
import { provisionWix } from "./provisionWix.js";
import { generateCode } from "./generateCode.js";
import { runChecks } from "./runChecks.js";
import { generatePreview } from "./generatePreview.js";
import { publish } from "./publish.js";

export const HANDLERS: Partial<Record<Stage, StageHandler>> = {
  GeneratingQuestions: generateQuestions,
  GeneratingSpecification: generateSpecification,
  GeneratingDesign: generateDesign,
  ProvisioningWix: provisionWix,
  GeneratingCode: generateCode,
  RunningChecks: runChecks,
  GeneratingPreview: generatePreview,
  Publishing: publish,
};

export type { StageHandler, StageContext, StageResult, ManualTaskDraft } from "./types.js";
