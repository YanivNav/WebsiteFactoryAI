/**
 * Produce something the user can actually judge.
 *
 * PHASE 1: fake.
 * PHASE 5: `wix preview` → a unique, shareable, versioned preview URL.
 *
 * This artifact is what the final approval gate hangs on — it exists because a
 * non-programmer cannot review a diff, but can absolutely review a rendered site.
 * Emitting it opens the review.
 */

import type { StageHandler } from "./types.js";
import { fakeWork } from "./fake.js";

export const generatePreview: StageHandler = {
  stage: "GeneratingPreview",

  async run(ctx) {
    await ctx.log("Preparing your preview");
    await fakeWork();

    // TODO(phase-5): WixService.preview() → shareable URL
    await ctx.emitArtifact("preview", {
      fake: true,
      url: "https://example.com/fake-preview",
    });

    await ctx.log("Preview ready for review");
    return { kind: "advance" };
  },
};
