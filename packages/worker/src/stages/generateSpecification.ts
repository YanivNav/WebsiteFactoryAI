/**
 * Brief → structured specification.
 *
 * PHASE 1: fake. Emits a canned specification so the review gate downstream is real.
 * PHASE 3: replace the body with services/openai (SpecGenerator). Nothing else changes.
 */

import type { StageHandler } from "./types.js";
import { fakeWork } from "./fake.js";

export const generateSpecification: StageHandler = {
  stage: "GeneratingSpecification",

  async run(ctx) {
    await ctx.log("Planning your site");
    await fakeWork();

    // TODO(phase-3): OpenAISpecGenerator.generate(ctx.brief)
    await ctx.emitArtifact("specification", {
      fake: true,
      pages: ["Home", "About", "Contact"],
      wixFeatures: ["CMS"],
      fromBrief: ctx.brief.slice(0, 80),
    });

    await ctx.log("Site plan ready for review");
    return { kind: "advance" };
  },
};
