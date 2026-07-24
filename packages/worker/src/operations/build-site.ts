import { type ManualTasks, type SiteBuild, type Specification, type WebsiteContent, wixDashboardUrl } from "@factory/shared";
import { CodeGenerator, type BuildReports } from "../services/code-generator";
import { getDevServerManager } from "../services/dev-server";
import { GitService } from "../services/git";
import { resolveApp } from "../services/wix-apps";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import type { WorkContext } from "./context";
import { readyCompletion, reviewCompletion, type WorkHandler } from "./types";

let git: GitService;
let wix: WixService;
let code: CodeGenerator;

const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

export const buildSite: WorkHandler<"buildSite"> = {
  operation: "buildSite",
  async run(ctx) {
    const [specArtifact, designArtifact, projectArtifact] = await Promise.all([
      ctx.getInput("specification"),
      ctx.getInput("design"),
      ctx.getInput("project"),
    ]);
    const spec = specArtifact.data;
    const project = projectArtifact.data;
    const revision = ctx.work.instruction.revision;

    git ??= new GitService();
    wix ??= new WixService();

    // Stop-dev: a fast trigger that kills the project's running dev server.
    if (revision?.stopDev) {
      await ctx.progress(50, "Stopping the dev server");
      await getDevServerManager().stop(ctx.work.projectId, ctx.workerId);
      return readyCompletion();
    }

    // Dev-only: a fast trigger that starts the dev server as a long-lived
    // background process. It returns as soon as the URL is up (or a bound is
    // hit); the server keeps running and streams its logs to the dev session.
    if (revision?.devOnly) {
      const devWorkspace = new LocalWorkspace(project.folderName);
      const repo = await git.ensureRepo(project.folderName);
      if (!(await devWorkspace.exists())) await git.restore(devWorkspace, repo);
      await ctx.progress(30, "Starting the dev server");
      await getDevServerManager().start(ctx.work.projectId, ctx.workerId, devWorkspace);
      return readyCompletion();
    }

    // Preview-only: build and generate a fresh preview URL.
    if (revision?.previewOnly) {
      const prevWorkspace = new LocalWorkspace(project.folderName);
      const repo = await git.ensureRepo(project.folderName);
      if (!(await prevWorkspace.exists())) await git.restore(prevWorkspace, repo);
      await ctx.progress(20, "Building for preview");
      const buildResult = await runBuild(prevWorkspace);
      if (buildResult.ok) {
        await ctx.progress(60, "Creating a fresh preview");
        const { siteUrl: previewUrl } = await wix.preview(ctx, prevWorkspace);
        return readyCompletion({ previewUrl, previewDashboardUrl: wixDashboardUrl(project.wix.siteId) });
      }
      ctx.log("warn", `Preview build failed: ${buildResult.failure.stderr.slice(-500)}`);
      return readyCompletion();
    }

    const previousBuild = await ctx.getRevisionBase("siteBuild");

    // Owner content baked into this build: an explicit content version from the
    // refine loop's content-edit, else whatever the previous build baked.
    const contentArtifactId = revision?.contentArtifactId ?? previousBuild?.data.contentArtifactId;
    const bakedContent = contentArtifactId
      ? (await ctx.getArtifact("websiteContent", contentArtifactId))?.data
      : undefined;
    // Owner-uploaded images/logos live in Convex storage; resolve each to a URL
    // the generated code can bake in.
    if (bakedContent) {
      for (const item of bakedContent.items) {
        if (item.assetId) item.value = (await ctx.getFileUrl(item.assetId)) ?? item.value;
      }
    }

    code ??= new CodeGenerator();

    const workspace = new LocalWorkspace(project.folderName);
    const repo = await git.ensureRepo(project.folderName);
    if (!(await workspace.exists())) {
      await ctx.progress(5, "Restoring your project");
      await git.restore(workspace, repo);
    }

    // Clean rebuild: revert the generated code to the fresh scaffold so the
    // agent builds from a clean slate (same site/repo/spec/design/content).
    if (revision?.cleanRebuild) {
      await ctx.progress(8, "Resetting to a clean starting point");
      await git.resetToScaffold(workspace);
    }

    const siteId = project.wix.siteId;
    const manualItems: ManualTasks["items"] = [];
    const installedApps: string[] = [];

    // 1. Install the business-solution apps the plan needs (automate-first).
    //    Installing an already-present app is a no-op, so no pre-check is needed
    //    (and the "list installed apps" API isn't callable with our API key).
    if (siteId) {
      await ctx.progress(12, "Setting up your Wix business features");
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
              detail: `I couldn't add "${name}" automatically (${error instanceof Error ? error.message : "unknown error"}). You can add it from your Wix dashboard.`,
              dashboardUrl: wixDashboardUrl(siteId),
              status: "open",
            });
          }
        } else if (resolved.kind === "unknown") {
          manualItems.push({
            id: `feature-${slug(name)}`,
            kind: "question",
            title: `Unrecognized business feature: ${name}`,
            detail: `The plan references "${name}" but I couldn't map it to a Wix app to install automatically. Confirm what it should be.`,
            status: "open",
          });
        }
      }
    } else {
      manualItems.push({
        id: "connect-project",
        kind: "manualTask",
        title: "Finish connecting your Wix project",
        detail: "This is a self-managed project without a provisioned Wix site id, so business features can't be installed automatically yet.",
        status: "open",
      });
    }

    // 2. Make sure the Wix skill docs exist in the project — the code agent reads
    //    them for correct SDK usage, and they are not part of the scaffold.
    await ctx.progress(25, "Loading the Wix building guides");
    await wix.ensureSkills(ctx, workspace);

    // Apply owner-supplied settings (e.g. a triggered-email id) into the project
    // environment before building, so the code can rely on them. The owner fills
    // a labelled field in the app; they never touch environment variables.
    for (const item of bakedContent?.items ?? []) {
      if (item.kind === "setting" && item.value) {
        await wix.setEnv(ctx, workspace, item.key, item.value);
      }
    }

    // 3. Produce the site's code — either restore an earlier version from git,
    //    or run the coding agent (which works directly in the project, with the
    //    brief and approved designs handed to it as files).
    let summary: string;
    let reports: BuildReports;
    if (revision?.revertToCommit) {
      await ctx.progress(40, "Restoring the earlier version of your site");
      await git.resetToCommit(workspace, revision.revertToCommit);
      summary = `Restored the site to an earlier version (${revision.revertToCommit.slice(0, 7)}).`;
      reports = { questions: [], manualTasks: [], content: [], unitsBuilt: [] };
    } else {
      await ctx.progress(30, "Building your pages and features");
      const designAssets = new Map(designArtifact.assets.map((a) => [a.id, a]));
      const designHtmlUrls: Record<string, string> = {};
      for (const screen of designArtifact.data.screens) {
        const url = designAssets.get(screen.htmlAssetId)?.url;
        if (url) designHtmlUrls[screen.path] = url;
      }
      const isRefine = revision?.mode === "revise" && !!revision?.feedback;
      const buildOrRefine = isRefine ? code.refine.bind(code) : code.build.bind(code);
      const built = await buildOrRefine(ctx, {
        workspace,
        spec,
        design: designArtifact.data,
        designHtmlUrls,
        content: bakedContent,
        feedback: revision?.feedback,
        siteId,
      });
      summary = built.summary;
      reports = built.reports;
    }

    // 4. Authoritative build check + one repair pass.
    //    First, scan for forbidden host-module imports — the agent sometimes
    //    writes @wix/site-* code despite the skill instructions.
    await ctx.progress(70, "Checking for unsupported imports");
    const forbiddenImports = await findHostModuleImports(workspace);
    if (forbiddenImports.length > 0) {
      await ctx.progress(72, "Removing unsupported Wix packages");
      await code.repair(ctx, {
        workspace,
        summary,
        failure: {
          command: "host-module check",
          stdout: "",
          stderr: `These files import @wix/site-* host modules, which cannot work in Headless. Replace them with REST API calls or Wix Automations:\n\n${forbiddenImports.join("\n")}\n\nNever import @wix/site-* packages. Use the REST API instead.`,
        },
      }, reports);
    }

    await ctx.progress(74, "Checking your site builds");
    let buildOk = await runBuild(workspace);
    if (!buildOk.ok && !revision?.revertToCommit) {
      await ctx.progress(76, "Fixing a build issue");
      await code.repair(ctx, { workspace, summary, failure: buildOk.failure }, reports);
      buildOk = await runBuild(workspace);
    }
    if (!buildOk.ok) {
      manualItems.push({
        id: "build-attention",
        kind: "question",
        title: "The site build needs attention",
        detail: "The site didn't build cleanly after an automatic fix attempt. Request a change describing what you'd like, and I'll try again.",
        status: "open",
      });
    }

    // Formatting is not the model's job — models minify to save tokens no matter
    // what the prompt says. Run a real formatter over the generated source.
    await ctx.progress(80, "Tidying up the code");
    await formatSource(ctx, workspace);

    // 4. Merge the content manifest: the slots the agent declared this run, keeping
    //    any values the owner already provided (by key), plus carried-forward slots.
    const content = mergeContent(bakedContent, reports.content);
    // Compose any dashboard help link from the real site id + the relative path
    // the agent reported. The agent supplies only the path; it never invents the
    // full link, so this can never 404 onto some other site.
    for (const item of content.items) {
      item.helpUrl = wixDashboardUrl(siteId, item.helpLink) ?? item.helpUrl;
    }

    // 5. Collect the build's questions + manual tasks.
    for (const q of reports.questions) {
      manualItems.push({ id: `q-${slug(q.title)}`, kind: "question", title: q.title, detail: q.detail, status: "open" });
    }
    for (const m of reports.manualTasks) {
      manualItems.push({
        id: `m-${slug(m.title)}`,
        kind: "manualTask",
        title: m.title,
        detail: m.detail,
        // The agent reports a relative dashboard path (never a full URL); the
        // factory scopes it to the real site so the link always lands correctly.
        dashboardUrl: wixDashboardUrl(siteId, m.dashboardPath),
        evidence: m.evidence,
        assist: m.assist,
        status: "open",
      });
    }

    // 6. Preview (only meaningful when the build succeeded).
    let previewUrl: string | undefined;
    let dashboardUrl: string | undefined;
    if (buildOk.ok) {
      await ctx.progress(84, "Creating a preview you can see");
      const preview = await wix.preview(ctx, workspace);
      previewUrl = preview.siteUrl;
    }
    // The dashboard link is derived from the real site id, not scraped — so it's
    // available whether or not the preview build produced a site URL.
    dashboardUrl = wixDashboardUrl(siteId);

    // 7. Back up the code.
    await ctx.progress(90, "Saving your site");
    const commitMessage = revision?.revertToCommit
      ? `Restore site to ${revision.revertToCommit.slice(0, 7)}`
      : revision?.cleanRebuild
        ? "Rebuild site from scratch"
        : revision?.feedback
          ? `Refine: ${revision.feedback}`
          : "Build site";
    await git.commitAndPush(workspace, repo, commitMessage);
    const repoRevision = (await workspace.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    // Store recent git history so the control panel can show it.
    const gitLogOutput = (await workspace.exec("git", [
      "log", "--format=%H%x00%s%x00%aI", "-n", "20",
    ])).stdout.trim();
    const commits = gitLogOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, message, date] = line.split("\0");
        return { sha: sha!, message: message ?? "", date: date ?? "" };
      });

    // 8. Emit content + manual-task artifacts, then the build (referencing them).
    //    In revise mode, content and manual-task artifacts are new versions;
    //    the siteBuild artifact is updated in place — git holds the history.
    const isRevise = revision && revision.mode !== "initial";
    const contentArtifact = await ctx.addArtifact(
      "content",
      "websiteContent",
      content,
      contentArtifactId,
    );
    const manualArtifact = await ctx.addArtifact("manualTasks", "manualTasks", { items: manualItems });
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
    await ctx.progress(96, "Finishing up");
    let buildArtifactId: string;
    if (isRevise && previousBuild) {
      const updated = await ctx.updateArtifact(previousBuild.id, "siteBuild", build);
      buildArtifactId = updated.id;
    } else {
      const newArtifact = await ctx.addArtifact("siteBuild", "siteBuild", build, previousBuild?.id);
      buildArtifactId = newArtifact.id;
    }
    // Initial build gets a review task (user can revise or approve → ready).
    // Scoped changes from the control panel go straight back to ready with
    // the preview URLs written to project.wix.
    if (revision && revision.mode !== "initial") return readyCompletion({ previewUrl, previewDashboardUrl: dashboardUrl });
    return reviewCompletion("buildSite", buildArtifactId);
  },
};

/**
 * Format the generated source with Prettier (plus the Astro plugin). Best-effort:
 * a formatting failure must not fail the build.
 */
async function formatSource(ctx: WorkContext, workspace: LocalWorkspace): Promise<void> {
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

/** Business-solution names the spec needs installed: CMS, Stores, and each `others`. */
function requiredSolutions(spec: Specification): string[] {
  const names: string[] = [];
  if (spec.businessSolutions.cms) names.push("cms");
  if (spec.businessSolutions.stores) names.push("stores");
  for (const other of spec.businessSolutions.others) names.push(other.name);
  return names;
}

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
    failure: { command: "wix build", stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) },
  };
}

/** Union the previous content (preserving owner values) with the slots declared this run. */
function mergeContent(
  baked: WebsiteContent | undefined,
  declared: WebsiteContent["items"],
): WebsiteContent {
  // Start with all baked items (preserving owner-entered values). Overlay
  // declared items on top for keys that match (updating label/help/kind).
  // Never drop baked items — the owner's data is precious; a slot the agent
  // no longer declares is just one the owner can still see and edit.
  const byKey = new Map<string, WebsiteContent["items"][number]>();
  for (const item of baked?.items ?? []) byKey.set(item.key, item);
  for (const item of declared) {
    const existing = byKey.get(item.key);
    byKey.set(item.key, existing ? { ...item, value: existing.value, assetId: existing.assetId } : item);
  }
  return { items: [...byKey.values()] };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

/** Scan the project for any @wix/site-* imports — these can never work. */
async function findHostModuleImports(workspace: LocalWorkspace): Promise<string[]> {
  const results: string[] = [];
  try {
    const output = (await workspace.exec("grep", ["-rn", "@wix/site-", "src/"], { timeoutMs: 5000 })).stdout;
    for (const line of output.trim().split("\n")) {
      if (line) results.push(line.slice(0, 200));
    }
  } catch {
    // grep returns non-zero when nothing matches — that's success.
  }
  return results;
}
