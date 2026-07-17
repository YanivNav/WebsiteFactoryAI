/** Approved plan + design + repository → an implemented Wix Headless site. */

import {
  BusinessRequirements,
  ImplementationUnitCheckpoint,
  type ImplementationPlan,
  parseProjectSpecification,
  parseWixSolutionArchitecture,
  ProjectDesign,
  WebsiteImplementationPlan,
  WixCapabilitySnapshot,
} from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import { loadPrompt } from "../lib/prompts.js";
import { OpenAICodexGenerator } from "../services/code/openai.js";
import type { CodeDesignScreen, CodeGenerator } from "../services/code";
import { createImplementationPlan, screensForUnit } from "../services/code/plan";
import { GitHubRestService, type GitHubService } from "../services/github";
import {
  formatGeneratedSource,
  validateGeneratedIntegrations,
  validateImplementationUnit,
} from "../services/implementation/verification";
import { WixCliService, type WixService } from "../services/wix";
import { triggeredEmailsDashboardUrl } from "../services/wix/dashboard-links";
import {
  normalizeCapabilitySdkPackages,
  requiredArchitectureSdkPackages,
  requiredSpecificationAppPermissions,
} from "../services/wix/sdk-package-registry";
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

function isDashboardConfiguration(
  actionType: string,
  configuration: { key: string; valueSource?: string | null },
) {
  // Wix's triggered-email recipient is the contact created from visitor input,
  // while the sender lives inside the published template. The template ID is the
  // only server-side dashboard value for this action.
  if (actionType === "sendTriggeredEmail") {
    return (
      configuration.key === "triggeredEmailTemplateId" &&
      (configuration.valueSource === "wixDashboard" || !configuration.valueSource)
    );
  }
  if (configuration.valueSource) return configuration.valueSource === "wixDashboard";
  return false;
}

export function requiredWorkflowSetup(
  specification: ReturnType<typeof parseProjectSpecification>,
  wixSiteId?: string,
  architecture: ReturnType<typeof parseWixSolutionArchitecture> | null = null,
) {
  return specification.infrastructure.visitorWorkflows.flatMap((workflow) => {
    const triggeredEmail = architecture?.journeySolutions.find(
      (journey) => journey.journeyId === workflow.id,
    )?.triggeredEmail;
    const expectedFields =
      triggeredEmail?.variables.map(({ name, description }) => ({ name, description })) ?? [];

    return workflow.actions.flatMap((action) =>
      action.requiresManualSetup
        ? action.requiredConfiguration
            .filter((configuration) => isDashboardConfiguration(action.type, configuration))
            .map((configuration) => {
              const isTriggeredEmail = action.type === "sendTriggeredEmail";
              return {
                taskKey: `${workflow.id}:${configuration.key}`,
                title: isTriggeredEmail
                  ? "Create the triggered email"
                  : `Finish Wix setup for ${workflow.name}`,
                description: isTriggeredEmail
                  ? "Create and publish the Wix Triggered Email used by this workflow. The factory sends it to the Wix contact created from the visitor's submitted email and supplies the page-specific values at runtime."
                  : configuration.description,
                wixDashboardUrl:
                  isTriggeredEmail && wixSiteId
                    ? triggeredEmailsDashboardUrl(wixSiteId)
                    : undefined,
                blocking: true as const,
                configuration: {
                  key: configuration.key,
                  label: isTriggeredEmail ? "Published Email ID" : "Required Wix value",
                  placeholder: isTriggeredEmail ? "For example: course_syllabus" : undefined,
                  instructions: isTriggeredEmail
                    ? [
                        "Open Triggered Emails in Wix using the link below.",
                        expectedFields.length > 0
                          ? "Create each case-sensitive template variable listed below."
                          : "This email does not use custom template variables.",
                        "Set and verify the sender inside the email, then publish it.",
                        "Copy the published Email ID and paste it below.",
                      ]
                    : [
                        "Complete the required setting in this site's Wix dashboard.",
                        "Copy the resulting value and paste it below.",
                      ],
                  expectedFields: isTriggeredEmail ? expectedFields : undefined,
                },
              };
            })
        : [],
    );
  });
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
      ? normalizeCapabilitySdkPackages(WixCapabilitySnapshot.parse(capabilityArtifact.data))
      : null;
    const wixSolutionArchitecture = architectureArtifact
      ? parseWixSolutionArchitecture(architectureArtifact.data)
      : null;
    const requiredSetup = requiredWorkflowSetup(
      specification,
      ctx.wix?.siteId,
      wixSolutionArchitecture,
    );
    const checklistKey = hashInputs({
      specificationArtifactId: specificationArtifact.id,
      tasks: requiredSetup,
    });
    await ctx.store.activateManualTaskChecklist(ctx.projectId, checklistKey);
    if (requiredSetup.length > 0) {
      const existingTasks = await ctx.store.getManualTaskStatuses(ctx.projectId, checklistKey);
      const completedTaskKeys = new Set(
        existingTasks.filter((task) => task.completed).map((task) => task.taskKey),
      );
      const incompleteSetup = requiredSetup.filter((task) => !completedTaskKeys.has(task.taskKey));
      if (incompleteSetup.length > 0) {
        await ctx.progress(8, "Waiting for required Wix setup");
        return { kind: "manualTasks", checklistKey, tasks: incompleteSetup };
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
      const completedSetup = await ctx.store.getManualTaskStatuses(ctx.projectId, checklistKey);
      const environment = Object.fromEntries(
        completedSetup.flatMap((task) => {
          return task.completed && task.configurationValue && task.configurationKey
            ? [[configurationEnvironmentName(task.configurationKey), task.configurationValue]]
            : [];
        }),
      );
      wixService ??= new WixCliService();
      await ctx.progress(10, "Saving the required Wix settings");
      await wixService.setEnvironmentVariables(environment, workspace);
    }

    await prepareRepositoryInstructions(workspace);
    wixService ??= new WixCliService();
    await wixService.ensureSdkPackages(
      wixCapabilitySnapshot
        ? requiredArchitectureSdkPackages(wixCapabilitySnapshot, wixSolutionArchitecture)
        : [],
      workspace,
      (message) => ctx.progress(11, message),
    );
    await wixService.ensureAppPermissions(
      requiredSpecificationAppPermissions(specification),
      workspace,
      (message) => ctx.progress(15, message),
    );
    await workspace.remove(".factory/context");
    const { screens, externalMediaUrls } = await materializeDesign(ctx, workspace, design);
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

    const proposedPlan = createImplementationPlan({
      specification,
      architecture: wixSolutionArchitecture,
      screens,
      specificationVersion: specificationArtifact.version,
      designVersion: designArtifact.version,
      change,
    });
    const latestPlanArtifact = await ctx.store.getLatestArtifact(
      ctx.projectId,
      "implementationPlan",
    );
    const savedPlan = WebsiteImplementationPlan.safeParse(latestPlanArtifact?.data);
    const implementationPlan: ImplementationPlan =
      savedPlan.success && savedPlan.data.planHash === proposedPlan.planHash
        ? savedPlan.data
        : proposedPlan;
    if (!savedPlan.success || savedPlan.data.planHash !== proposedPlan.planHash) {
      await ctx.emitArtifact("implementationPlan", implementationPlan, {
        promptHash: "",
        inputsHash: implementationPlan.planHash,
      });
    }

    const latestBuildReport = await ctx.store.getLatestArtifact(ctx.projectId, "buildReport");
    const latestReport = ImplementationUnitCheckpoint.safeParse(latestBuildReport?.data);
    const resumesVerifiedUnits =
      latestReport.success && latestReport.data.planHash === implementationPlan.planHash;
    const firstUnit = resumesVerifiedUnits ? latestReport.data.unitIndex + 1 : 0;
    const initialBaseRevision =
      resumesVerifiedUnits && latestReport.data.initialBaseRevision
        ? latestReport.data.initialBaseRevision
        : baseRevision;
    const codePrompt = loadPrompt("code");
    const models = new Set<string>();
    if (resumesVerifiedUnits) models.add(latestReport.data.model);
    const unitSummaries: Array<{ id: string; summary: string; revision: string }> = [];
    codeGenerator ??= new OpenAICodexGenerator();

    if (firstUnit > 0) {
      await ctx.progress(
        46,
        `Resuming after ${firstUnit} verified ${firstUnit === 1 ? "part" : "parts"}`,
      );
    }

    for (let unitIndex = firstUnit; unitIndex < implementationPlan.units.length; unitIndex += 1) {
      const unit = implementationPlan.units[unitIndex]!;
      const unitScreens = screensForUnit(unit, screens);
      const startPercent = 46 + Math.round((unitIndex / implementationPlan.units.length) * 39);
      const verifiedPercent =
        46 + Math.round(((unitIndex + 1) / implementationPlan.units.length) * 39);
      let generated: Awaited<ReturnType<CodeGenerator["build"]>> | null = null;
      let unitError: Error | null = null;

      for (let pass = 0; pass < 2; pass += 1) {
        const label =
          pass === 0
            ? `Building ${unit.title} · ${unitIndex + 1} of ${implementationPlan.units.length}`
            : `Repairing ${unit.title} · ${unitIndex + 1} of ${implementationPlan.units.length}`;
        await ctx.progress(startPercent, label);
        generated = await codeGenerator.build(
          {
            task:
              pass === 0
                ? unit.task
                : [
                    `Repair only the “${unit.title}” implementation unit.`,
                    `The factory verification failed: ${unitError?.message ?? "unknown failure"}`,
                    `Original unit task: ${unit.task}`,
                    "Keep previously verified units intact and satisfy every acceptance criterion before finishing.",
                  ].join("\n"),
            specification,
            screens: unitScreens,
            unit,
          },
          workspace,
          (message) => ctx.progress(startPercent, message),
        );
        models.add(generated.model);

        await ctx.progress(
          Math.min(verifiedPercent, startPercent + 3),
          `Verifying ${unit.title} · ${unitIndex + 1} of ${implementationPlan.units.length}`,
        );
        await formatGeneratedSource(workspace);
        try {
          await validateImplementationUnit(workspace, wixResources, specification, unit);
          await wixService.build(workspace);
          unitError = null;
          break;
        } catch (error) {
          unitError = error instanceof Error ? error : new Error(String(error));
          if (pass === 1) throw unitError;
        }
      }

      if (!generated) throw new Error(`The ${unit.title} implementation did not run`);
      const revision = await githubService.commitAndPush(
        workspace,
        `feat: implement ${unit.title}`,
      );
      unitSummaries.push({ id: unit.id, summary: generated.summary, revision });
      await ctx.emitArtifact(
        "buildReport",
        {
          kind: "implementationUnit",
          ok: true,
          planHash: implementationPlan.planHash,
          unitIndex,
          unitId: unit.id,
          unitTitle: unit.title,
          summary: generated.summary,
          model: generated.model,
          initialBaseRevision,
          revision,
          checks: ["source validation", "Wix production build"],
        },
        {
          promptHash: generated.promptHash,
          inputsHash: hashInputs({ implementationPlan, unit, initialBaseRevision }),
        },
      );
      await ctx.progress(
        verifiedPercent,
        `Verified ${unit.title} · ${unitIndex + 1} of ${implementationPlan.units.length}`,
      );
    }

    let finalGenerated: Awaited<ReturnType<CodeGenerator["build"]>> | null = null;
    let validationError: Error | null = null;
    for (let pass = 0; pass < 2; pass += 1) {
      await ctx.progress(
        88 + pass * 3,
        pass === 0 ? "Checking the complete website" : "Checking the final repairs",
      );
      await formatGeneratedSource(workspace);
      try {
        await validateGeneratedIntegrations(workspace, wixResources, specification);
        await ctx.progress(91, "Building the complete Wix site");
        await wixService.build(workspace);
        validationError = null;
        break;
      } catch (error) {
        validationError = error instanceof Error ? error : new Error(String(error));
        if (pass === 1) break;
        await ctx.progress(89, "Repairing the complete website");
        finalGenerated = await codeGenerator.build(
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
          (label) => ctx.progress(89, label),
        );
        models.add(finalGenerated.model);
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
      change ? "fix: complete requested website change" : "fix: complete website integration",
    );
    const inputs = {
      implementationPlan,
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
      baseRevision: initialBaseRevision,
      repository: { owner: github.owner, name: github.name },
      models: [...models],
      wixResources,
    };
    await ctx.emitArtifact(
      "buildReport",
      {
        kind: "implementationComplete",
        ok: true,
        summary:
          finalGenerated?.summary ??
          `${implementationPlan.units.length} implementation units completed and verified.`,
        model: finalGenerated?.model ?? [...models].at(-1) ?? "unknown",
        baseRevision: initialBaseRevision,
        revision,
        repository: github.htmlUrl,
        specificationVersion: specificationArtifact.version,
        designVersion: designArtifact.version,
        changeRequestId: change?.id ?? null,
        planHash: implementationPlan.planHash,
        units: implementationPlan.units.map((unit) => unit.id),
        completedThisRun: unitSummaries,
      },
      { promptHash: finalGenerated?.promptHash ?? codePrompt.hash, inputsHash: hashInputs(inputs) },
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
