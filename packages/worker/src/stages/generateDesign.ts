/**
 * Specification → design.
 *
 * PHASE 1: fake.
 * PHASE 4: services/stitch. Real output is HTML + a screenshot per screen — reviewable
 *          by a human, and directly consumable by code generation.
 */

import type { StageHandler } from "./types.js";
import { fakeWork, FAKE_PROVENANCE } from "./fake.js";

export const generateDesign: StageHandler = {
  stage: "GeneratingDesign",

  async run(ctx) {
    await ctx.log("Designing your site");
    await fakeWork();

    // TODO(phase-4): StitchDesignGenerator.generate(approvedSpecification)
    await ctx.emitArtifact(
      "design",
      {
        fake: true,
        screens: [
          { name: "Home", html: null, screenshot: null },
          { name: "About", html: null, screenshot: null },
        ],
      },
      FAKE_PROVENANCE,
    );

    await ctx.log("Design ready for review");
    return { kind: "advance" };
  },
};
