import type { ManualTasks, SiteBuild, Specification, WebsiteContent } from "@factory/shared";
import { CodeGenerator } from "../services/code-generator";
import { GitService } from "../services/git";
import { resolveApp } from "../services/wix-apps";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { reviewCompletion, type WorkHandler } from "./types";

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
    const previousBuild = await ctx.getRevisionBase("siteBuild");
    const revision = ctx.work.instruction.revision;

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

    git ??= new GitService();
    wix ??= new WixService();
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
        const resolved = resolveApp(name);
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
              dashboardUrl: `https://manage.wix.com/dashboard/${siteId}/app-market`,
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

    // 2. Build the site (the agent creates collections, seeds data, imports media,
    //    writes pages/workflows/backend, and builds as it goes).
    await ctx.progress(30, "Building your pages and features");
    // The design stage produced real HTML per screen; hand the agent a way to
    // read it so it adapts real markup instead of guessing from a text prompt.
    const designAssets = new Map(designArtifact.assets.map((a) => [a.id, a]));
    const designHtmlUrls: Record<string, string> = {};
    for (const screen of designArtifact.data.screens) {
      const url = designAssets.get(screen.htmlAssetId)?.url;
      if (url) designHtmlUrls[screen.path] = url;
    }
    const { summary, reports } = await code.build(ctx, {
      workspace,
      wix,
      siteId,
      spec,
      design: designArtifact.data,
      designHtmlUrls,
      content: bakedContent,
      feedback: revision?.feedback,
    });

    // 3. Authoritative build check + one repair pass.
    await ctx.progress(72, "Checking your site builds");
    let buildOk = await runBuild(workspace);
    if (!buildOk.ok) {
      await ctx.progress(76, "Fixing a build issue");
      await code.repair(ctx, { workspace, wix, siteId, summary, failure: buildOk.failure }, reports);
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

    // 4. Merge the content manifest: the slots the agent declared this run, keeping
    //    any values the owner already provided (by key), plus carried-forward slots.
    const content = mergeContent(bakedContent, reports.content);

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
        dashboardUrl: m.dashboardUrl,
        status: "open",
      });
    }

    // 6. Preview (only meaningful when the build succeeded).
    let previewUrl: string | undefined;
    if (buildOk.ok) {
      await ctx.progress(84, "Creating a preview you can see");
      previewUrl = await wix.preview(ctx, workspace);
    }

    // 7. Back up the code.
    await ctx.progress(90, "Saving your site");
    const commitMessage = revision?.cleanRebuild
      ? "Rebuild site from scratch"
      : revision?.feedback
        ? `Refine: ${revision.feedback}`
        : "Build site";
    await git.commitAndPush(workspace, repo, commitMessage);
    const repoRevision = (await workspace.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    // 8. Emit content + manual-task artifacts, then the build (referencing them).
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
      previewUrl,
      contentArtifactId: contentArtifact.id,
      manualTasksArtifactId: manualArtifact.id,
      installedApps,
      unitsBuilt: reports.unitsBuilt,
    };
    await ctx.progress(96, "Finishing up");
    const buildArtifact = await ctx.addArtifact("siteBuild", "siteBuild", build, previousBuild?.id);
    return reviewCompletion("buildSite", buildArtifact.id);
  },
};

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
  const byKey = new Map<string, WebsiteContent["items"][number]>();
  for (const item of baked?.items ?? []) byKey.set(item.key, item);
  for (const item of declared) {
    const existing = byKey.get(item.key);
    // Keep the owner's value/asset if they already filled this slot.
    byKey.set(item.key, existing ? { ...item, value: existing.value, assetId: existing.assetId } : item);
  }
  return { items: [...byKey.values()] };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}
