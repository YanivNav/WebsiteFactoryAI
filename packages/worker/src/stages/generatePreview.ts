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
import { GitHubRestService, type GitHubService } from "../services/github";
import { WixCliService, type WixService } from "../services/wix";
import { LocalWorkspace, type Workspace } from "../workspace";
import { hashInputs } from "../lib/hash.js";

interface PreviewDependencies {
  githubService: GitHubService;
  wixService: WixService;
  workspace: Workspace;
}

export function createGeneratePreview(overrides: Partial<PreviewDependencies> = {}): StageHandler {
  return {
    stage: "GeneratingPreview",

    async run(ctx) {
      const dependencies: PreviewDependencies = {
        githubService: overrides.githubService ?? new GitHubRestService(),
        wixService: overrides.wixService ?? new WixCliService(),
        workspace: overrides.workspace ?? new LocalWorkspace(ctx.projectId),
      };
      await ctx.progress(8, "Preparing your Wix preview");
      await ctx.progress(18, "Syncing the latest website version");
      const sourceRevision = await dependencies.githubService.syncCanonical(dependencies.workspace);
      await ctx.progress(32, "Verifying the website before previewing");
      await dependencies.wixService.build(dependencies.workspace);
      await ctx.progress(55, "Publishing a shareable Wix preview");
      const preview = await dependencies.wixService.preview(dependencies.workspace, (message) =>
        ctx.progress(70, message),
      );
      await ctx.emitArtifact(
        "preview",
        { url: preview.url, sourceRevision },
        {
          promptHash: "",
          inputsHash: hashInputs({
            stage: "GeneratingPreview",
            sourceRevision,
            wixSiteId: ctx.wix?.siteId,
          }),
        },
      );

      await ctx.progress(96, "Wix preview is ready for testing");
      return { kind: "advance" };
    },
  };
}

export const generatePreview = createGeneratePreview();
