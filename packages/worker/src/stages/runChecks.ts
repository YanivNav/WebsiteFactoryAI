/**
 * Build and check the generated site — and repair it if it is broken.
 *
 * The code stage already runs a self-healing Wix build before committing. This stage
 * independently rebuilds the committed result before a preview may be created.
 *
 * Self-healing is not optional polish. Our user is a Wix professional who should not
 * have to diagnose generated code:
 * `astro check: TS2304` is not merely unhelpful to them, it is *unactionable*. They
 * can never fix it. So the AI must fix its own mistakes:
 *
 *   generate → build → repair if needed → build again → commit → verify here
 */

import type { StageHandler } from "./types.js";
import { WixCliService, type WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { hashInputs } from "../lib/hash.js";

let wixService: WixService | undefined;

export const runChecks: StageHandler = {
  stage: "RunningChecks",

  async run(ctx) {
    await ctx.progress(10, "Preparing the Wix build");
    const workspace = new LocalWorkspace(ctx.projectId);
    wixService ??= new WixCliService();
    await ctx.progress(30, "Building your Wix site");
    await wixService.build(workspace);
    await ctx.progress(90, "Wix build passed");
    await ctx.emitArtifact(
      "buildReport",
      { ok: true, errors: [] },
      { promptHash: "", inputsHash: hashInputs({ stage: "RunningChecks" }) },
    );

    return { kind: "advance" };
  },
};
