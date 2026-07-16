/** Approved plan + design + repository → an implemented Wix Headless site. */

import {
  BusinessRequirements,
  parseProjectSpecification,
  ProjectDesign,
  WixCapabilitySnapshot,
  WixSolutionArchitecture,
} from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import { loadPrompt } from "../lib/prompts.js";
import { OpenAICodexGenerator } from "../services/code/openai.js";
import type { CodeDesignScreen, CodeGenerator } from "../services/code";
import { GitHubRestService, type GitHubService } from "../services/github";
import { WixCliService, type WixService, type WixSiteResources } from "../services/wix";
import { LocalWorkspace, type Workspace } from "../workspace";
import type { StageHandler } from "./types.js";

let codeGenerator: CodeGenerator | undefined;
let githubService: GitHubService | undefined;
let wixService: WixService | undefined;

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

function configurationEnvironmentName(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

function requiredWorkflowSetup(specification: ReturnType<typeof parseProjectSpecification>) {
  return specification.infrastructure.visitorWorkflows.flatMap((workflow) =>
    workflow.actions.flatMap((action) =>
      action.requiresManualSetup
        ? action.requiredConfiguration.map((configuration) => ({
            title: `Configure ${configuration.key} for ${workflow.name}`,
            description: [
              configuration.description,
              `Save the value in the Wix site's server-side environment settings as ${configurationEnvironmentName(configuration.key)}, then mark this action complete.`,
            ].join(" "),
            blocking: true as const,
          }))
        : [],
    ),
  );
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
): Promise<{ screens: CodeDesignScreen[]; externalMediaUrls: string[] }> {
  const screens: CodeDesignScreen[] = [];
  const externalMediaUrls = new Set<string>();
  for (const [index, screen] of design.screens.entries()) {
    const label = `Preparing ${screen.pageTitle} for implementation`;
    await ctx.log(label, {
      kind: "stage-progress",
      label,
      percent: Math.round(12 + ((index + 1) / Math.max(1, design.screens.length)) * 18),
    });
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
    const htmlText = new TextDecoder().decode(html.bytes);
    for (const match of htmlText.matchAll(
      /https:\/\/[^\s"'<>)]*googleusercontent\.com[^\s"'<>)]*/g,
    )) {
      externalMediaUrls.add(match[0].replaceAll("&amp;", "&"));
    }
    screens.push({
      pageTitle: screen.pageTitle,
      pagePath: screen.pagePath,
      htmlPath,
      screenshotPath,
    });
  }
  return { screens, externalMediaUrls: [...externalMediaUrls] };
}

async function validateGeneratedIntegrations(
  workspace: Workspace,
  resources: WixSiteResources,
  specification: ReturnType<typeof parseProjectSpecification>,
) {
  const sourceFiles = (await workspace.glob("src/**/*")).filter((file) =>
    /\.(astro|js|jsx|ts|tsx)$/.test(file),
  );
  const sources = await Promise.all(
    sourceFiles.map(async (file) => ({ file, content: await workspace.readFile(file) })),
  );
  const combined = sources.map((source) => source.content).join("\n");
  const visibleSources = sources
    .filter(({ file }) => /\.(astro|jsx|tsx)$/.test(file) && !file.includes("/api/"))
    .map(({ content }) => content)
    .join("\n");

  if (combined.includes("googleusercontent.com")) {
    throw new Error("Generated site still hotlinks temporary Google design images");
  }
  const placeholderMatch = visibleSources.match(
    /(?:not configured yet|awaiting (?:wix )?configuration|configuration is missing|contact .* for (?:a|your) copy)/i,
  );
  if (placeholderMatch) {
    throw new Error(
      `Generated site replaced required behavior with a placeholder message: ${placeholderMatch[0]}`,
    );
  }
  const inlineSubmitHandler = sources.find(
    ({ file, content }) =>
      file.endsWith(".astro") &&
      /<script(?:\s|>)/.test(content) &&
      /addEventListener\(\s*["']submit["']/.test(content),
  );
  if (inlineSubmitHandler) {
    throw new Error(
      `Generated business form in ${inlineSubmitHandler.file} uses an inline submit script instead of a typed interactive component`,
    );
  }
  if (resources.cmsCollections.length > 0 && !combined.includes("@wix/wix-data-items-sdk")) {
    throw new Error("Generated site does not connect to Wix CMS");
  }
  if (resources.cmsCollections.length > 0 && !combined.includes("items.query")) {
    throw new Error("Generated site imports Wix CMS but never queries it");
  }
  for (const collection of resources.cmsCollections) {
    const collectionLiteral = new RegExp(
      `[\\"']${collection.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\"']`,
    );
    if (!collectionLiteral.test(combined)) {
      throw new Error(`Generated site does not query the ${collection.displayName} CMS collection`);
    }
    const fixtureName = collection.id.toLowerCase().replace(/[^a-z0-9]/g, "");
    const fixture = sourceFiles.find((file) => {
      const basename =
        file
          .split("/")
          .at(-1)
          ?.replace(/\.[^.]+$/, "")
          .toLowerCase() ?? "";
      return file.startsWith("src/data/") && basename.replace(/[^a-z0-9]/g, "") === fixtureName;
    });
    if (fixture) {
      throw new Error(
        `Generated site replaced the ${collection.displayName} CMS collection with ${fixture}`,
      );
    }
  }

  if (resources.forms.length > 0) {
    if (!combined.includes("@wix/forms")) {
      throw new Error("Generated site contains forms but does not connect them to Wix Forms");
    }
    if (!combined.includes("submissions.createSubmission")) {
      throw new Error("Generated site forms do not save submissions to Wix");
    }
    if (!combined.includes("client:load")) {
      throw new Error("Generated site forms are not interactive in the browser");
    }
  }

  const workflowActions = new Set(
    specification.infrastructure.visitorWorkflows.flatMap((workflow) =>
      workflow.actions.map((action) => action.type),
    ),
  );
  const requiresCustomContactCapture =
    resources.formsMode === "customCrm" && workflowActions.has("saveFormSubmission");
  if (
    (workflowActions.has("createOrUpdateContact") || requiresCustomContactCapture) &&
    !combined.includes("appendOrCreateContact")
  ) {
    throw new Error("Generated site does not create or update the visitor's Wix contact");
  }
  if (workflowActions.has("sendTriggeredEmail") && !combined.includes("emailContact")) {
    throw new Error("Generated site does not send the required triggered email");
  }
}

async function formatGeneratedSource(workspace: Workspace) {
  const result = await workspace.exec("pnpm", [
    "exec",
    "prettier",
    "--plugin=prettier-plugin-astro",
    "--write",
    "src/**/*.{astro,css,js,jsx,json,ts,tsx}",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Could not format the generated site files");
  }
}

export const generateCode: StageHandler = {
  stage: "GeneratingCode",

  async run(ctx) {
    await ctx.progress(3, "Reviewing the approved site plan");

    const [
      specificationArtifact,
      designArtifact,
      requirementsArtifact,
      capabilityArtifact,
      architectureArtifact,
    ] = await Promise.all([
      ctx.store.getLatestApproved(ctx.projectId, "specification"),
      ctx.store.getLatestApproved(ctx.projectId, "design"),
      ctx.store.getLatestArtifact(ctx.projectId, "businessRequirements"),
      ctx.store.getLatestArtifact(ctx.projectId, "wixCapabilitySnapshot"),
      ctx.store.getLatestArtifact(ctx.projectId, "wixSolutionArchitecture"),
    ]);
    if (!specificationArtifact) throw new Error("No approved site plan found");
    if (!designArtifact) throw new Error("No approved design found");
    const specification = parseProjectSpecification(specificationArtifact.data);
    const design = ProjectDesign.parse(designArtifact.data);
    const businessRequirements = requirementsArtifact
      ? BusinessRequirements.parse(requirementsArtifact.data)
      : null;
    const wixCapabilitySnapshot = capabilityArtifact
      ? WixCapabilitySnapshot.parse(capabilityArtifact.data)
      : null;
    const wixSolutionArchitecture = architectureArtifact
      ? WixSolutionArchitecture.parse(architectureArtifact.data)
      : null;
    const requiredSetup = requiredWorkflowSetup(specification);
    if (requiredSetup.length > 0) {
      const existingTasks = await ctx.store.getManualTaskStatuses(ctx.projectId);
      const completedTitles = new Set(
        existingTasks.filter((task) => task.completed).map((task) => task.title),
      );
      const incompleteSetup = requiredSetup.filter((task) => !completedTitles.has(task.title));
      if (incompleteSetup.length > 0) {
        await ctx.progress(8, "Waiting for required Wix setup");
        return { kind: "manualTasks", tasks: incompleteSetup };
      }
    }
    const change = await ctx.store.nextQueuedChangeRequest(ctx.projectId);
    const opening = change ? "Applying your requested changes" : "Building your site";
    await ctx.progress(5, opening);

    const workspace = new LocalWorkspace(ctx.projectId);
    githubService ??= new GitHubRestService();
    await ctx.progress(8, "Syncing the latest project version");
    const github = await githubService.ensureRepository({
      projectId: ctx.projectId,
      projectTitle: ctx.projectTitle,
      workspace,
      // GitHub is canonical. A previous run may have left derived, uncommitted files
      // even when a manual retry reset the persisted attempt counter.
      restoreInterruptedAttempt: true,
    });
    const baseRevisionResult = await workspace.exec("git", ["rev-parse", "HEAD"]);
    if (baseRevisionResult.exitCode !== 0) {
      throw new Error(baseRevisionResult.stderr || "Could not read the current project version");
    }
    const baseRevision = baseRevisionResult.stdout.trim();

    if (requiredSetup.length > 0) {
      const completedSetup = await ctx.store.getManualTaskStatuses(ctx.projectId);
      const environment = Object.fromEntries(
        completedSetup.flatMap((task) => {
          const match = task.title.match(/^Configure (\S+) for /);
          const key = match?.[1];
          return task.completed && task.configurationValue && key
            ? [[configurationEnvironmentName(key), task.configurationValue]]
            : [];
        }),
      );
      wixService ??= new WixCliService();
      await ctx.progress(10, "Saving the required Wix settings");
      await wixService.setEnvironmentVariables(environment, workspace);
    }

    await prepareRepositoryInstructions(workspace);
    await workspace.remove(".factory/context");
    const { screens, externalMediaUrls } = await materializeDesign(ctx, workspace, design);
    wixService ??= new WixCliService();
    await ctx.log("Preparing Wix CMS and site media", {
      kind: "stage-progress",
      label: "Preparing Wix CMS and site media",
      percent: 35,
    });
    const wixResources = await wixService.prepareSiteResources(
      specification,
      externalMediaUrls,
      workspace,
      (message) => ctx.progress(35, message),
    );
    await workspace.writeFile(
      ".factory/context/site.json",
      `${JSON.stringify(
        {
          specification,
          businessRequirements,
          wixCapabilitySnapshot,
          wixSolutionArchitecture,
          design: {
            stitchProjectId: design.stitchProjectId,
            screens,
          },
          sourceArtifacts: {
            specificationVersion: specificationArtifact.version,
            designVersion: designArtifact.version,
          },
          wixResources,
        },
        null,
        2,
      )}\n`,
    );
    await ctx.log("Project inputs are ready", {
      kind: "stage-progress",
      label: "Project inputs are ready",
      percent: 45,
    });

    const task = change
      ? change.description
      : "Implement every route in the approved specification and match all supplied desktop designs. Build the complete initial Wix Headless website; preserve the scaffold and wire required Wix business solutions.";
    codeGenerator ??= new OpenAICodexGenerator();
    let generated = await codeGenerator.build(
      { task, specification, screens },
      workspace,
      (label) => ctx.log(label, { kind: "stage-progress", label, percent: 50 }),
    );
    let validationError: Error | null = null;
    for (let pass = 0; pass < 2; pass += 1) {
      await ctx.progress(
        85 + pass * 4,
        pass === 0 ? "Reviewing the implementation" : "Reviewing the fixes",
      );
      await formatGeneratedSource(workspace);
      try {
        await validateGeneratedIntegrations(workspace, wixResources, specification);
        await ctx.progress(90, "Building the Wix site");
        await wixService.build(workspace);
        validationError = null;
        break;
      } catch (error) {
        validationError = error instanceof Error ? error : new Error(String(error));
        if (pass === 1) break;
        await ctx.progress(88, "Fixing incomplete website behavior");
        generated = await codeGenerator.build(
          {
            task: [
              "Audit and repair the implementation. Do not redesign it.",
              `Validation failure: ${validationError.message}`,
              "Inspect every visible form, dialog, button, search control, and filter.",
              "Replace placeholder behavior with the complete Wix-backed workflow from the specification.",
              "Business forms must be typed client components, not inline Astro submit scripts.",
            ].join("\n"),
            specification,
            screens,
          },
          workspace,
          (label) => ctx.progress(88, label),
        );
      }
    }
    if (validationError) throw validationError;

    await ctx.log("Saving the implemented site", {
      kind: "stage-progress",
      label: "Saving the implemented site",
      percent: 96,
    });
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
      wixResources,
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
    await ctx.log("Site implementation ready for checks", {
      kind: "stage-progress",
      label: "Site implementation ready for checks",
      percent: 100,
    });
    return { kind: "codeGenerated", github };
  },
};
