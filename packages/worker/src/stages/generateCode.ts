/** Approved plan + design + repository → an implemented Wix Headless site. */

import { ProjectDesign, ProjectSpecification } from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import { loadPrompt } from "../lib/prompts.js";
import { OpenAICodexGenerator } from "../services/code/openai.js";
import type { CodeDesignScreen, CodeGenerator } from "../services/code";
import { GitHubRestService, type GitHubService } from "../services/github";
import { LocalWorkspace, type Workspace } from "../workspace";
import type { StageHandler } from "./types.js";

let codeGenerator: CodeGenerator | undefined;
let githubService: GitHubService | undefined;

function safeName(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || fallback;
}

function imageExtension(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "png";
}

async function optionalFile(workspace: Workspace, filePath: string) {
  try {
    return await workspace.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function prepareRepositoryInstructions(workspace: Workspace) {
  const gitignore = (await optionalFile(workspace, ".gitignore")) ?? "";
  const entries = gitignore.split(/\r?\n/);
  if (!entries.includes(".factory/")) {
    const separator = gitignore.length > 0 && !gitignore.endsWith("\n") ? "\n" : "";
    await workspace.writeFile(".gitignore", `${gitignore}${separator}.factory/\n`);
  }

  if ((await optionalFile(workspace, "AGENTS.md")) === null) {
    await workspace.writeFile("AGENTS.md", loadPrompt("site-agents").text);
  }
}

async function materializeDesign(
  ctx: Parameters<StageHandler["run"]>[0],
  workspace: Workspace,
  design: ReturnType<typeof ProjectDesign.parse>,
): Promise<CodeDesignScreen[]> {
  const screens: CodeDesignScreen[] = [];
  for (const [index, screen] of design.screens.entries()) {
    await ctx.log(`Preparing ${screen.pageTitle} for implementation`);
    const [html, screenshot] = await Promise.all([
      ctx.store.getBlob(screen.htmlStorageId),
      ctx.store.getBlob(screen.screenshotStorageId),
    ]);
    const basename = `${String(index + 1).padStart(2, "0")}-${safeName(screen.pageTitle, "screen")}`;
    const htmlPath = `.factory/context/screens/${basename}.html`;
    const screenshotPath = `.factory/context/screens/${basename}.${imageExtension(screenshot.contentType)}`;
    await Promise.all([
      workspace.writeFile(htmlPath, html.bytes),
      workspace.writeFile(screenshotPath, screenshot.bytes),
    ]);
    screens.push({
      pageTitle: screen.pageTitle,
      pagePath: screen.pagePath,
      htmlPath,
      screenshotPath,
    });
  }
  return screens;
}

export const generateCode: StageHandler = {
  stage: "GeneratingCode",

  async run(ctx) {
    const change = await ctx.store.nextQueuedChangeRequest(ctx.projectId);
    await ctx.log(change ? "Applying your requested changes" : "Building your site");

    const [specificationArtifact, designArtifact] = await Promise.all([
      ctx.store.getLatestApproved(ctx.projectId, "specification"),
      ctx.store.getLatestApproved(ctx.projectId, "design"),
    ]);
    if (!specificationArtifact) throw new Error("No approved site plan found");
    if (!designArtifact) throw new Error("No approved design found");
    const specification = ProjectSpecification.parse(specificationArtifact.data);
    const design = ProjectDesign.parse(designArtifact.data);

    const workspace = new LocalWorkspace(ctx.projectId);
    githubService ??= new GitHubRestService();
    await ctx.log("Syncing the latest project version");
    const github = await githubService.ensureRepository({
      projectId: ctx.projectId,
      projectTitle: ctx.projectTitle,
      workspace,
      restoreInterruptedAttempt: ctx.attempts > 0,
    });
    const baseRevisionResult = await workspace.exec("git", ["rev-parse", "HEAD"]);
    if (baseRevisionResult.exitCode !== 0) {
      throw new Error(baseRevisionResult.stderr || "Could not read the current project version");
    }
    const baseRevision = baseRevisionResult.stdout.trim();

    await prepareRepositoryInstructions(workspace);
    await workspace.remove(".factory/context");
    const screens = await materializeDesign(ctx, workspace, design);
    await workspace.writeFile(
      ".factory/context/site.json",
      `${JSON.stringify(
        {
          specification,
          design: {
            stitchProjectId: design.stitchProjectId,
            screens,
          },
          sourceArtifacts: {
            specificationVersion: specificationArtifact.version,
            designVersion: designArtifact.version,
          },
        },
        null,
        2,
      )}\n`,
    );

    const task = change
      ? change.description
      : "Implement every route in the approved specification and match all supplied desktop designs. Build the complete initial Wix Headless website; preserve the scaffold and wire required Wix business solutions.";
    codeGenerator ??= new OpenAICodexGenerator();
    const generated = await codeGenerator.build(
      { task, specification, screens },
      workspace,
      ctx.log,
    );

    await ctx.log("Saving the implemented site");
    const revision = await githubService.commitAndPush(
      workspace,
      change ? "feat: apply requested website change" : "feat: implement approved website",
    );
    const inputs = {
      task,
      specificationArtifact: {
        id: specificationArtifact.id,
        version: specificationArtifact.version,
        data: specification,
      },
      designArtifact: {
        id: designArtifact.id,
        version: designArtifact.version,
        data: design,
      },
      baseRevision,
      repository: { owner: github.owner, name: github.name },
      model: generated.model,
    };
    await ctx.emitArtifact(
      "buildReport",
      {
        ok: true,
        summary: generated.summary,
        model: generated.model,
        baseRevision,
        revision,
        repository: github.htmlUrl,
        specificationVersion: specificationArtifact.version,
        designVersion: designArtifact.version,
        changeRequestId: change?.id ?? null,
      },
      { promptHash: generated.promptHash, inputsHash: hashInputs(inputs) },
    );

    if (change) await ctx.store.completeChangeRequest(change.id, "done");
    await ctx.log("Site implementation ready for checks");
    return { kind: "codeGenerated", github };
  },
};
