import { type SiteRelease, wixDashboardUrl } from "@factory/shared";
import { GitService } from "../services/git";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import type { LeasedSiteAction, ServerAccess, SiteActionCompletion } from "../server";
import { SiteActionContext } from "./site-action-context";

const git = new GitService();
const wix = new WixService();

export async function handlePublish(
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
): Promise<SiteActionCompletion> {
  const ctx = new SiteActionContext(action, workerId, server);

  const buildId = action.data.buildArtifactId as string;
  if (!buildId) throw new Error("Missing build artifact ID");

  const wixProjectId = action.approvedArtifactIds.wixProject;
  if (!wixProjectId) throw new Error("Missing wixProject artifact reference");

  const [buildArt, projectArt] = await Promise.all([
    server.getArtifact(action.projectId, buildId),
    server.getArtifact(action.projectId, wixProjectId),
  ]);
  if (!buildArt || !projectArt) throw new Error("Missing required artifacts");

  const build = buildArt.data as { repoRevision: string };
  const project = projectArt.data as { folderName: string; wix: { siteId: string } };
  const siteId = project.wix.siteId;

  const workspace = new LocalWorkspace(project.folderName);
  if (!(await workspace.exists())) {
    const repo = await git.ensureRepo(project.folderName);
    ctx.log("info", "Restoring your project");
    await git.restore(workspace, repo);
  }

  ctx.log("info", "Publishing your site");
  const { siteUrl: liveUrl } = await wix.release(ctx, workspace);
  const liveDashboardUrl = wixDashboardUrl(siteId);
  if (!liveUrl) {
    ctx.log("warn", "Published, but no live site URL was found in the CLI output");
  }

  const release: SiteRelease = { liveUrl, repoRevision: build.repoRevision };
  await ctx.addArtifact("siteRelease", "siteRelease", release);

  return {
    liveUrl: liveUrl ?? liveDashboardUrl,
    dashboardUrl: liveDashboardUrl,
  };
}
