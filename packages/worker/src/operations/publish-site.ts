import type { SiteRelease } from "@factory/shared";
import { GitService } from "../services/git";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { reviewCompletion, type WorkHandler } from "./types";

let git: GitService;
let wix: WixService;

export const publishSite: WorkHandler<"publishSite"> = {
  operation: "publishSite",
  async run(ctx) {
    const [buildArtifact, projectArtifact] = await Promise.all([
      ctx.getInput("build"),
      ctx.getInput("project"),
    ]);
    const build = buildArtifact.data;
    const { folderName } = projectArtifact.data;

    git ??= new GitService();
    wix ??= new WixService();

    // Release from the project's checkout; restore it from the GitHub backup if
    // the local workspace was lost.
    const workspace = new LocalWorkspace(folderName);
    if (!(await workspace.exists())) {
      const repo = await git.ensureRepo(folderName);
      await ctx.progress(10, "Restoring your project");
      await git.restore(workspace, repo);
    }

    await ctx.progress(40, "Publishing your site");
    // `release` throws only when the CLI itself fails. If it succeeds but we
    // couldn't scrape the URL from its output, the site is still published — so
    // record the release without a URL rather than failing the whole stage.
    const liveUrl = await wix.release(ctx, workspace);
    if (!liveUrl) {
      ctx.log("warn", "Published, but no live URL was found in the CLI output");
    }

    const release: SiteRelease = { liveUrl, repoRevision: build.repoRevision };
    await ctx.progress(95, "Your site is live");
    const artifact = await ctx.addArtifact("siteRelease", "siteRelease", release);
    return reviewCompletion("publishSite", artifact.id);
  },
};
