/**
 * Create the Wix site and the local repository.
 *
 * PHASE 1: fake — but it DOES raise real manual tasks, because that gate is exactly
 *          the thing worth testing while the work is still fake.
 * PHASE 5: `npm create @wix/new@latest -- headless --folder-name … --business-name …`
 *
 * THIS MUST RUN BEFORE CODE GENERATION. The scaffold *creates the repository* —
 * running it afterwards would overwrite everything Claude just wrote. Do not reorder.
 */

import type { StageHandler } from "./types.js";
import { fakeWork } from "./fake.js";

export const provisionWix: StageHandler = {
  stage: "ProvisioningWix",

  async run(ctx) {
    await ctx.log("Setting up your Wix site");
    await fakeWork();

    // TODO(phase-5): WixService.provision(...) → capture metaSiteId, then build the
    // deep links from it (see the note below).

    // Automation stops here: plain language, and a "Done" button.
    //
    // NOTE — NO `wixDashboardUrl` YET, DELIBERATELY.
    //
    // Wix dashboard pages are SITE-SCOPED (`manage.wix.com/dashboard/{metaSiteId}/…`),
    // so a correct link cannot exist until provisioning has actually run and returned
    // a real site ID. In Phase 5 these URLs get *derived* from that ID.
    //
    // Until then we ship no link rather than a guessed one. A confident link to a
    // dead page is the worst possible outcome for a user who cannot read code and has
    // no way to recover from a 404 — it is precisely the failure this product exists
    // to prevent. The dashboard already renders fine without a URL.
    //
    // When the real links land: verify every path against a live Wix site first.
    return {
      kind: "manualTasks",
      tasks: [
        {
          title: "Upgrade to a Wix Premium plan",
          description:
            "Your site needs a Premium plan before it can go live on your own domain.",
          blocking: true,
        },
        {
          title: "Connect a payment provider",
          description:
            "Optional for now — you can add this later if you want to take payments.",
          blocking: false,
        },
      ],
    };
  },
};
