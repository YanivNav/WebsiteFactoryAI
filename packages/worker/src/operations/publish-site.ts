import { type SiteRelease, wixDashboardUrl } from "@factory/shared";
import { GitService } from "../services/git";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { readyCompletion, type WorkHandler } from "./types";

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
    const siteId = projectArtifact.data.wix.siteId;

    git ??= new GitService();
    wix ??= new WixService();

    const workspace = new LocalWorkspace(folderName);
    if (!(await workspace.exists())) {
      const repo = await git.ensureRepo(folderName);
      await ctx.progress(10, "Restoring your project");
      await git.restore(workspace, repo);
    }

    await ctx.progress(40, "Publishing your site");
    const { siteUrl: liveUrl } = await wix.release(ctx, workspace);
    const liveDashboardUrl = wixDashboardUrl(siteId);
    if (!liveUrl) {
      ctx.log("warn", "Published, but no live site URL was found in the CLI output");
    }

    const release: SiteRelease = { liveUrl, repoRevision: build.repoRevision };
    await ctx.progress(95, "Your site is live");
    const artifact = await ctx.addArtifact("siteRelease", "siteRelease", release);
    return readyCompletion({ liveUrl: liveUrl ?? liveDashboardUrl, dashboardUrl: liveDashboardUrl });
  },
};
