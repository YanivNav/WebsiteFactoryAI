/**
 * Ship it.
 *
 * PHASE 1: fake.
 * PHASE 5: `wix release` → publishes, returns the live URL, clears the site cache.
 *
 * Note what is NOT involved: GitHub. `wix release` deploys from the local checkout.
 * GitHub is a backup, not a foundation, and is not in the critical path.
 *
 * Advancing from here lands on `Completed` — a RESTING state. A ChangeRequest sends
 * the project straight back to `GeneratingCode`, and round it goes again.
 */

import type { StageHandler } from "./types.js";
import { fakeWork, FAKE_PROVENANCE } from "./fake.js";

export const publish: StageHandler = {
  stage: "Publishing",

  async run(ctx) {
    await ctx.progress(10, "Preparing your site for publishing");
    await fakeWork();

    // TODO(phase-5): WixManagedPublisher.release() → live URL
    await ctx.emitArtifact(
      "releaseReport",
      { fake: true, liveUrl: "https://example.com/fake-live" },
      FAKE_PROVENANCE,
    );

    await ctx.progress(90, "Finishing publication");
    return { kind: "advance" };
  },
};
