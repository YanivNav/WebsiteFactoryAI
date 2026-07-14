/**
 * Specification + design + repository → a working Astro application.
 *
 * PHASE 1: fake.
 * PHASE 5: services/claude (Agent SDK), running in-process with `cwd` set to the
 *          checkout. Claude is never told "build my website" — it gets the spec, the
 *          design, the repo, CLAUDE.md, and ONE scoped task.
 *
 * This is also the stage a ChangeRequest re-enters. "Make the hero blue" is just
 * another scoped task against an existing repository — which is why `Completed` is a
 * resting state rather than a terminal one, and why the change-request queue needs no
 * machinery of its own.
 */

import type { StageHandler } from "./types.js";
import { fakeWork } from "./fake.js";

export const generateCode: StageHandler = {
  stage: "GeneratingCode",

  async run(ctx) {
    // If a change request is queued, this run is servicing it. The lease guarantees
    // we are the only writer, so requests are applied strictly one at a time — that
    // serialization IS the conflict avoidance.
    const change = await ctx.store.nextQueuedChangeRequest(ctx.projectId);

    if (change) {
      await ctx.log("Building your site", { changeRequest: change.description });
    } else {
      await ctx.log("Building your site");
    }

    await fakeWork();

    // TODO(phase-5): ClaudeCodeGenerator.build({ spec, design, repo, task })

    if (change) {
      await ctx.store.completeChangeRequest(change.id, "done");
    }

    return { kind: "advance" };
  },
};
