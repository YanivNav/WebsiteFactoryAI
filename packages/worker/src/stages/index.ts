/**
 * The stage dispatch table.
 *
 * Waiting stages are absent by design. Every runnable stage currently uses the same
 * placeholder so the polling, leasing, renewal, transition, and recovery behavior can
 * be developed independently from website-generation logic.
 */
import { isRunnableStage, STAGES, STAGE_LABELS, type Stage } from "@factory/shared";
import { fakeWork } from "./fake";
import type { StageHandler } from "./types";

export const HANDLERS = Object.fromEntries(
  STAGES.filter(isRunnableStage).map((stage) => [
    stage,
    {
      stage,
      async run(context) {
        await context.log(`${STAGE_LABELS[stage]} (placeholder)`);
        await fakeWork();
        return { kind: "advance" };
      },
    } satisfies StageHandler,
  ]),
) as Partial<Record<Stage, StageHandler>>;

export type { StageContext, StageHandler, StageResult } from "./types";
