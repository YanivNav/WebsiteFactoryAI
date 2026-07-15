/**
 * Build and check the generated site — and repair it if it is broken.
 *
 * PHASE 1: fake, always succeeds.
 * PHASE 5: `wix build` + `astro check`, AND THE SELF-HEALING LOOP.
 *
 * That loop is not optional polish. Our user is a Wix merchant who cannot read code:
 * `astro check: TS2304` is not merely unhelpful to them, it is *unactionable*. They
 * can never fix it. So the AI must fix its own mistakes:
 *
 *   build fails → feed the error back to Claude → fix → rebuild → up to N attempts
 *               → only then escalate
 *
 * A human sees "We hit a snag while building your site — retrying." Never a stack
 * trace. Raw output goes to the structured logs, behind "Technical details".
 */

import type { StageHandler } from "./types.js";
import { fakeWork, FAKE_PROVENANCE } from "./fake.js";

export const runChecks: StageHandler = {
  stage: "RunningChecks",

  async run(ctx) {
    await ctx.log("Checking your site");
    await fakeWork(1500);

    // TODO(phase-5): const result = await wix.build()
    //                if (!result.ok) → services/claude repair loop, N attempts
    await ctx.emitArtifact("buildReport", { fake: true, ok: true, errors: [] }, FAKE_PROVENANCE);

    return { kind: "advance" };
  },
};
