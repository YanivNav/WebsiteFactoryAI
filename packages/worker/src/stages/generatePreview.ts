/**
 * Produce something the user can actually judge.
 *
 * `wix preview` produces a unique, shareable, versioned preview URL.
 *
 * This artifact is what the final approval gate hangs on — it exists because a
 * non-programmer cannot review a diff, but can absolutely review a rendered site.
 * Emitting it opens the review.
 */

import type { StageHandler } from "./types.js";
import { WixCliService, type WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { hashInputs } from "../lib/hash.js";

let wixService: WixService | undefined;

export const generatePreview: StageHandler = {
  stage: "GeneratingPreview",

  async run(ctx) {
    await ctx.progress(10, "Preparing your Wix preview");
    const workspace = new LocalWorkspace(ctx.projectId);
    wixService ??= new WixCliService();
    await ctx.progress(35, "Creating a shareable preview");
    const preview = await wixService.preview(workspace);
    await ctx.emitArtifact(
      "preview",
      { url: preview.url },
      { promptHash: "", inputsHash: hashInputs({ stage: "GeneratingPreview" }) },
    );

    await ctx.progress(90, "Finalizing your preview");
    return { kind: "advance" };
  },
};
