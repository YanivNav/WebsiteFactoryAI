/**
 * The stage dispatch table.
 *
 * Waiting stages are absent by design. Every runnable stage currently uses the same
 * placeholder so the polling, leasing, renewal, transition, and recovery behavior can
 * be developed independently from website-generation logic.
 */
import { isRunnableStage, STAGES, type Stage } from "@factory/shared";
import { fakeWork } from "./fake";
import type { StageHandler } from "./types";
import {generateQuestions} from "./generate-questions";
import {generateSpecification} from "./generate-specification";

export const HANDLERS: Partial<Record<Stage, StageHandler>> = {
  'GeneratingQuestions': generateQuestions,
  'GeneratingSpecification': generateSpecification
}

export type { StageHandler, StageResult } from "./types";
