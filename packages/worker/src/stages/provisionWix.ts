/**
 * Create the Wix site and the local repository.
 *
 * PHASE 5: `npm create @wix/new@latest headless -- --folder-name … --business-name …`
 *
 * THIS MUST RUN BEFORE CODE GENERATION. The scaffold *creates the repository* —
 * running it afterwards would overwrite everything Claude just wrote. Do not reorder.
 */

import type { StageHandler } from "./types.js";
import { WixCliService, type WixService } from "../services/wix";
import { GitHubRestService, type GitHubService } from "../services/github";
import { LocalWorkspace } from "../workspace";

let wixService: WixService | undefined;
let githubService: GitHubService | undefined;

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
    await ctx.progress(5, "Starting Wix setup");
    const workspace = new LocalWorkspace(ctx.projectId);
    wixService ??= new WixCliService();
    await ctx.progress(15, "Creating your Wix site");
    const wix = await wixService.provision(
      {
        projectId: ctx.projectId,
        businessName: ctx.settings.businessName?.trim() || `Website ${ctx.projectId.slice(-6)}`,
        siteTemplate: siteTemplate(ctx.settings.siteTemplate),
      },
      workspace,
    );
    await ctx.progress(70, "Backing up your project");
    githubService ??= new GitHubRestService();
    const github = await githubService.ensureRepository({
      projectId: ctx.projectId,
      projectTitle: ctx.projectTitle,
      workspace,
    });
    await ctx.progress(95, "Finishing Wix setup");
    await ctx.log("Wix site is ready", {
      kind: "wix-provisioned",
      siteId: wix.siteId,
    });

    // Manual Wix tasks are added only when a concrete site requirement calls for
    // one and its site-scoped dashboard path has been verified. Provisioning itself
    // has no human step, so code generation can begin immediately.
    return { kind: "wixProvisioned", wix, github };
  },
};
