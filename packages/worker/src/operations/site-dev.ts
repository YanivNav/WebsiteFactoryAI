import { GitService } from "../services/git";
import { getDevServerManager } from "../services/dev-server";
import { LocalWorkspace } from "../workspace";
import type { LeasedSiteAction, ServerAccess, SiteActionCompletion } from "../server";
import { SiteActionContext } from "./site-action-context";

const git = new GitService();

export async function handleStartDev(
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
): Promise<SiteActionCompletion> {
  const ctx = new SiteActionContext(action, workerId, server);
  const wixProjectId = action.approvedArtifactIds.wixProject!;
  const projectArt = await server.getArtifact(action.projectId, wixProjectId);
  if (!projectArt) throw new Error("Missing wixProject artifact");
  const project = projectArt.data as { folderName: string };

  const workspace = new LocalWorkspace(project.folderName);
  const repo = await git.ensureRepo(project.folderName);
  if (!(await workspace.exists())) await git.restore(workspace, repo);

  ctx.log("info", "Starting the dev server");
  await getDevServerManager().start(action.projectId, workerId, workspace);
  return {};
}

export async function handleStopDev(
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
): Promise<SiteActionCompletion> {
  const ctx = new SiteActionContext(action, workerId, server);
  ctx.log("info", "Stopping the dev server");
  await getDevServerManager().stop(action.projectId, workerId);
  return {};
}
