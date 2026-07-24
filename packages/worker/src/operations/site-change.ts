import { type ManualTasks, type SiteBuild, type WebsiteContent, wixDashboardUrl } from "@factory/shared";
import { CodeGenerator, type BuildReports } from "../services/code-generator";
import { GitService } from "../services/git";
import { resolveApp } from "../services/wix-apps";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import type { LeasedSiteAction, ServerAccess, SiteActionCompletion } from "../server";
import { SiteActionContext } from "./site-action-context";

const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
const git = new GitService();
const wix = new WixService();
const code = new CodeGenerator();

/**
 * A full-build control-panel action: change request, clean rebuild, git revert,
 * content edit, or screen change. Reads approved artifacts directly instead of
 * going through work instruction inputs.
 */
export async function handleSiteChange(
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
): Promise<SiteActionCompletion> {
  const ctx = new SiteActionContext(action, workerId, server);
  const approved = action.approvedArtifactIds;
  const data = action.data;

  // ---- Resolve approved artifacts ------------------------------------------

  const [specArt, designArt, projectArt] = await Promise.all([
    server.getArtifact(action.projectId, approved.specification!),
    server.getArtifact(action.projectId, approved.design!),
    server.getArtifact(action.projectId, approved.wixProject!),
  ]);
  if (!specArt || !designArt || !projectArt) {
    throw new Error("Missing approved artifacts");
  }
  const spec = specArt.data as any;
  const design = designArt.data as any;
  const project = projectArt.data as any;

  // ---- Content -------------------------------------------------------------

  let bakedContent: WebsiteContent | undefined;
  if (data.contentArtifactId) {
    const contentArt = await server.getArtifact(
      action.projectId,
      data.contentArtifactId as string,
    );
    bakedContent = (contentArt?.data as WebsiteContent | undefined);
  }
  if (bakedContent) {
    for (const item of bakedContent.items) {
      if (item.assetId) item.value = (await ctx.getFileUrl(item.assetId)) ?? item.value;
    }
  }

  // ---- Workspace -----------------------------------------------------------

  const workspace = new LocalWorkspace(project.folderName);
  const repo = await git.ensureRepo(project.folderName);
  if (!(await workspace.exists())) {
    ctx.log("info", "Restoring your project");
    await git.restore(workspace, repo);
  }

  if (action.type === "cleanRebuild") {
    ctx.log("info", "Resetting to a clean starting point");
    await git.resetToScaffold(workspace);
  }

  const siteId = project.wix.siteId;
  const manualItems: ManualTasks["items"] = [];
  const installedApps: string[] = [];

  // ---- Wix setup -----------------------------------------------------------

  if (siteId) {
    ctx.log("info", "Setting up your Wix business features");
    for (const name of requiredSolutions(spec)) {
      const resolved = await resolveApp(name, workspace);
      if (resolved.kind === "app") {
        try {
          await wix.installApp(siteId, resolved.appDefId);
          installedApps.push(resolved.appDefId);
        } catch (error) {
          manualItems.push({
            id: `install-${slug(name)}`,
            kind: "manualTask",
            title: `Add the ${name} feature in Wix`,
            detail: `I couldn't add "${name}" automatically (${error instanceof Error ? error.message : "unknown error"}). Add it from your Wix dashboard.`,
            dashboardUrl: wixDashboardUrl(siteId),
            status: "open",
          });
        }
      }
    }
  }

  // ---- Skills & settings ---------------------------------------------------

  ctx.log("info", "Loading the Wix building guides");
  await wix.ensureSkills(ctx, workspace);

  for (const item of bakedContent?.items ?? []) {
    if (item.kind === "setting" && item.value) {
      await wix.setEnv(ctx, workspace, item.key, item.value);
    }
  }

  // ---- Code generation (or git restore) ------------------------------------

  let summary: string;
  let reports: BuildReports;
  const commit = action.type === "revertToCommit" || action.type === "revertSiteTo"
    ? (data.commit as string | undefined)
    : undefined;

  if (commit) {
    ctx.log("info", `Restoring site to ${commit.slice(0, 7)}`);
    await git.resetToCommit(workspace, commit);
    summary = `Restored the site to an earlier version (${commit.slice(0, 7)}).`;
    reports = { questions: [], manualTasks: [], content: [], unitsBuilt: [] };
  } else {
    ctx.log("info", "Building your pages and features");
    const designAssets = new Map(designArt.assets.map((a) => [a.id, a]));
    const designHtmlUrls: Record<string, string> = {};
    for (const screen of design.screens) {
      const url = designAssets.get(screen.htmlAssetId)?.url;
      if (url) designHtmlUrls[screen.path] = url;
    }

    const feedback = typeof data.feedback === "string" ? data.feedback : undefined;
    const screenPath = typeof data.screenPath === "string" ? data.screenPath : undefined;
    const isRefine = !!feedback || !!screenPath;

    const buildOrRefine = isRefine ? code.refine.bind(code) : code.build.bind(code);
    const built = await buildOrRefine(ctx, {
      workspace,
      spec,
      design,
      designHtmlUrls,
      content: bakedContent,
      feedback,
      siteId,
    });
    summary = built.summary;
    reports = built.reports;
  }

  // ---- Build validation ----------------------------------------------------

  ctx.log("info", "Checking for unsupported imports");
  const forbiddenImports = await findHostModuleImports(workspace);
  if (forbiddenImports.length > 0) {
    ctx.log("info", "Removing unsupported Wix packages");
    await code.repair(ctx, {
      workspace,
      summary,
      failure: {
        command: "host-module check",
        stdout: "",
        stderr: `These files import @wix/site-* host modules. Replace them with REST API calls or Wix Automations:\n\n${forbiddenImports.join("\n")}\n\nNever import @wix/site-* packages. Use the REST API instead.`,
      },
    }, reports);
  }

  ctx.log("info", "Checking your site builds");
  let buildOk = await runBuild(workspace);
  if (!buildOk.ok && !commit) {
    ctx.log("info", "Fixing a build issue");
    await code.repair(ctx, { workspace, summary, failure: buildOk.failure }, reports);
    buildOk = await runBuild(workspace);
  }
  if (!buildOk.ok) {
    manualItems.push({
      id: "build-attention",
      kind: "question",
      title: "The site build needs attention",
      detail: "The site didn't build cleanly after an automatic fix attempt. Request a change and I'll try again.",
      status: "open",
    });
  }

  // ---- Format, content merge, preview, commit ------------------------------

  ctx.log("info", "Tidying up the code");
  await formatSource(ctx, workspace);

  const content = mergeContent(bakedContent, reports.content);
  for (const item of content.items) {
    item.helpUrl = wixDashboardUrl(siteId, item.helpLink) ?? item.helpUrl;
  }

  for (const q of reports.questions) {
    manualItems.push({
      id: `q-${slug(q.title)}`,
      kind: "question",
      title: q.title,
      detail: q.detail,
      status: "open",
    });
  }
  for (const m of reports.manualTasks) {
    manualItems.push({
      id: `m-${slug(m.title)}`,
      kind: "manualTask",
      title: m.title,
      detail: m.detail,
      dashboardUrl: wixDashboardUrl(siteId, m.dashboardPath),
      evidence: m.evidence,
      assist: m.assist,
      status: "open",
    });
  }

  let previewUrl: string | undefined;
  if (buildOk.ok) {
    ctx.log("info", "Creating a preview you can see");
    const preview = await wix.preview(ctx, workspace);
    previewUrl = preview.siteUrl;
  }
  const dashboardUrl = wixDashboardUrl(siteId);

  const commitMsg = commit
    ? `Restore site to ${commit.slice(0, 7)}`
    : action.type === "cleanRebuild"
      ? "Rebuild site from scratch"
      : data.feedback
        ? `Refine: ${(data.feedback as string).slice(0, 80)}`
        : "Site change";
  ctx.log("info", "Saving your site");
  await git.commitAndPush(workspace, repo, commitMsg);
  const repoRevision = (await workspace.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

  // Git history for the control panel.
  const gitLogOutput = (
    await workspace.exec("git", ["log", "--format=%H%x00%s%x00%aI", "-n", "20"])
  ).stdout.trim();
  const commits = gitLogOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, message, date] = line.split("\0");
      return { sha: sha!, message: message ?? "", date: date ?? "" };
    });

  // ---- Emit artifacts ------------------------------------------------------

  const contentArtifact = await ctx.addArtifact(
    "content",
    "websiteContent",
    content,
  );
  const manualArtifact = await ctx.addArtifact(
    "manualTasks",
    "manualTasks",
    { items: manualItems },
  );

  const build: SiteBuild = {
    summary,
    repoRevision,
    builtAt: Date.now(),
    previewUrl,
    dashboardUrl,
    commits,
    contentArtifactId: contentArtifact.id,
    manualTasksArtifactId: manualArtifact.id,
    installedApps,
    unitsBuilt: reports.unitsBuilt,
  };

  await ctx.addArtifact("siteBuild", "siteBuild", build);

  ctx.log("info", "Site change complete");
  return { previewUrl, dashboardUrl, previewDashboardUrl: dashboardUrl };
}

// ---- Helpers (extracted from build-site.ts) --------------------------------

type BuildOutcome =
  | { ok: true }
  | { ok: false; failure: { command: string; stdout: string; stderr: string } };

async function runBuild(workspace: LocalWorkspace): Promise<BuildOutcome> {
  const result = await workspace.exec("npx", ["--yes", "@wix/cli@latest", "build"], {
    env: { AI_AGENT: "website-factory" },
    stripPackageManagerEnv: true,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.code === 0) return { ok: true };
  return {
    ok: false,
    failure: {
      command: "wix build",
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-4000),
    },
  };
}

async function formatSource(
  ctx: { log: (level: "info" | "warn" | "error", msg: string) => void },
  workspace: LocalWorkspace,
): Promise<void> {
  const result = await workspace.exec(
    "npx",
    [
      "--yes",
      "--package=prettier@3",
      "--package=prettier-plugin-astro",
      "prettier",
      "--write",
      "--plugin=prettier-plugin-astro",
      "src/**/*.{astro,ts,tsx,js,jsx,css,json}",
    ],
    { stripPackageManagerEnv: true, timeoutMs: 5 * 60 * 1000 },
  );
  if (result.code !== 0) {
    ctx.log("warn", `Formatting skipped: ${(result.stderr || result.stdout).slice(-300)}`);
  }
}

function requiredSolutions(spec: {
  businessSolutions: { cms?: boolean; stores?: boolean; others: Array<{ name: string }> };
}): string[] {
  const names: string[] = [];
  if (spec.businessSolutions.cms) names.push("cms");
  if (spec.businessSolutions.stores) names.push("stores");
  for (const other of spec.businessSolutions.others) names.push(other.name);
  return names;
}

function mergeContent(
  baked: WebsiteContent | undefined,
  declared: WebsiteContent["items"],
): WebsiteContent {
  const byKey = new Map<string, WebsiteContent["items"][number]>();
  for (const item of baked?.items ?? []) byKey.set(item.key, item);
  for (const item of declared) {
    const existing = byKey.get(item.key);
    byKey.set(
      item.key,
      existing ? { ...item, value: existing.value, assetId: existing.assetId } : item,
    );
  }
  return { items: [...byKey.values()] };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

async function findHostModuleImports(workspace: LocalWorkspace): Promise<string[]> {
  const results: string[] = [];
  try {
    const output = (
      await workspace.exec("grep", ["-rn", "@wix/site-", "src/"], { timeoutMs: 5000 })
    ).stdout;
    for (const line of output.trim().split("\n")) {
      if (line) results.push(line.slice(0, 200));
    }
  } catch {
    // grep returns non-zero when nothing matches — that's success.
  }
  return results;
}
