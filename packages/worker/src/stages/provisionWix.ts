/**
 * Create the Wix site and the local repository.
 *
 * PHASE 5: `npm create @wix/new@latest headless -- --folder-name … --business-name …`
 *
 * THIS MUST RUN BEFORE CODE GENERATION. The scaffold *creates the repository* —
 * running it afterwards would overwrite everything Claude just wrote. Do not reorder.
 */

import type { StageHandler } from "./types.js";
import { WixCliService, type WixService } from "../services/wix/index.js";
import { LocalWorkspace } from "../workspace/index.js";

let wixService: WixService | undefined;

function siteTemplate(value?: string) {
  return value === "commerce" ||
    value === "scheduler" ||
    value === "registration" ||
    value === "blank"
    ? value
    : "blank";
}

export const provisionWix: StageHandler = {
  stage: "ProvisioningWix",

  async run(ctx) {
    await ctx.log("Setting up your Wix site");
    const workspace = new LocalWorkspace(ctx.projectId);
    wixService ??= new WixCliService();
    await ctx.log("Creating the Wix-managed site and project files");
    const wix = await wixService.provision(
      {
        projectId: ctx.projectId,
        businessName: ctx.settings.businessName?.trim() || `Website ${ctx.projectId.slice(-6)}`,
        siteTemplate: siteTemplate(ctx.settings.siteTemplate),
      },
      workspace,
    );
    await ctx.log("Wix site is ready", {
      kind: "wix-provisioned",
      siteId: wix.siteId,
    });

    // Manual Wix tasks are added only when a concrete site requirement calls for
    // one and its site-scoped dashboard path has been verified. Provisioning itself
    // has no human step, so code generation can begin immediately.
    return { kind: "wixProvisioned", wix };
  },
};
