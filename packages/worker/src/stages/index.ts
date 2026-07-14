/**
 * The stage registry — the worker's dispatch table.
 *
 * Only *runnable* stages appear here. `Waiting*` stages have no handler by design:
 * they are not things the worker does, they are things the worker declines to do.
 * That absence is the human-in-the-loop mechanism, and it is why no pause/resume
 * code exists anywhere in this codebase.
 */

import type { Stage } from "@factory/shared";
import type { StageHandler } from "./types.js";

// TODO(phase-1): register handlers here as they are implemented.
//
//   export const HANDLERS: Partial<Record<Stage, StageHandler>> = {
//     GeneratingSpecification: generateSpecification,
//     GeneratingDesign:        generateDesign,
//     ProvisioningWix:         provisionWix,
//     GeneratingCode:          generateCode,
//     RunningChecks:           runChecks,
//     GeneratingPreview:       generatePreview,
//     Publishing:              publish,
//   };

export const HANDLERS: Partial<Record<Stage, StageHandler>> = {};

export type { StageHandler, StageContext, StageResult } from "./types.js";
