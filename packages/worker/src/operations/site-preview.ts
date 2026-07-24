import { wixDashboardUrl } from "@factory/shared";
import { GitService } from "../services/git";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import type { LeasedSiteAction, ServerAccess, SiteActionCompletion } from "../server";
import { SiteActionContext } from "./site-action-context";

const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
const git = new GitService();
const wix = new WixService();

export async function handlePreview(
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
): Promise<SiteActionCompletion> {
  const ctx = new SiteActionContext(action, workerId, server);
  const wixProjectId = action.approvedArtifactIds.wixProject;
  if (!wixProjectId) throw new Error("Missing wixProject artifact reference");

  const projectArt = await server.getArtifact(action.projectId, wixProjectId);
  if (!projectArt) throw new Error("Missing wixProject artifact");
  const project = projectArt.data as { folderName: string; wix: { siteId: string } };

  const workspace = new LocalWorkspace(project.folderName);
  const repo = await git.ensureRepo(project.folderName);
  if (!(await workspace.exists())) await git.restore(workspace, repo);

  ctx.log("info", "Building for preview");
  const buildResult = await workspace.exec("npx", ["--yes", "@wix/cli@latest", "build"], {
    env: { AI_AGENT: "website-factory" },
    stripPackageManagerEnv: true,
    timeoutMs: BUILD_TIMEOUT_MS,
  });

  if (buildResult.code !== 0) {
    ctx.log("warn", `Preview build failed: ${buildResult.stderr.slice(-500)}`);
    return {};
  }

  ctx.log("info", "Creating a fresh preview");
  const { siteUrl: previewUrl } = await wix.preview(ctx, workspace);
  return {
    previewUrl,
    previewDashboardUrl: wixDashboardUrl(project.wix.siteId),
  };
}
