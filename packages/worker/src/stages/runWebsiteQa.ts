import {
  BusinessRequirements,
  parseProjectSpecification,
  parseWixSolutionArchitecture,
  WebsiteQaReport,
  type QaPlan,
  type QaReport,
} from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import { loadPrompt } from "../lib/prompts.js";
import { OpenAICodexGenerator } from "../services/code/openai.js";
import type { CodeGenerator } from "../services/code";
import { GitHubRestService, type GitHubService } from "../services/github";
import {
  formatGeneratedSource,
  validateGeneratedIntegrations,
} from "../services/implementation/verification";
import {
  PlaywrightWebsiteQaService,
  type BrowserQaCheckResult,
  type WebsiteQaService,
} from "../services/qa";
import { createWebsiteQaPlan } from "../services/qa/plan";
import {
  WixAccountConfigurationError,
  WixCliService,
  type WixService,
  type WixSiteResources,
} from "../services/wix";
import { appInstallerUrl, cmsDashboardUrl } from "../services/wix/dashboard-links";
import { requiredSpecificationAppPermissions } from "../services/wix/sdk-package-registry";
import { LocalWorkspace, type Workspace } from "../workspace";
import type { StageContext, StageHandler } from "./types.js";

interface QaDependencies {
  qaService: WebsiteQaService;
  codeGenerator: CodeGenerator;
  githubService: GitHubService;
  wixService: WixService;
  workspace: Workspace;
  validateIntegrations: typeof validateGeneratedIntegrations;
}

const MISSING_DYNAMIC_CONTENT = "No published website link matched the dynamic route ";
const PAGE_ERROR = "Page displays an error:";

function repeatedSharedPageError(results: BrowserQaCheckResult[]) {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (!result.id.startsWith("route-")) continue;
    for (const failure of result.failures.filter((item) => item.startsWith(PAGE_ERROR))) {
      counts.set(failure, (counts.get(failure) ?? 0) + 1);
    }
  }
  return [...counts.values()].some((count) => count >= 2);
}

function likelyNeedsWixAppPermissionUpdate(
  results: BrowserQaCheckResult[],
  requiredPermissions: string[],
) {
  if (requiredPermissions.length === 0 || !repeatedSharedPageError(results)) return false;
  const failedWorkflow = results.some(
    (result) =>
      result.id.startsWith("workflow-") &&
      result.failures.some((failure) =>
        /status 500|neither a successful request nor a visible success state/i.test(failure),
      ),
  );
  return failedWorkflow || results.filter((result) => !result.passed).length >= 3;
}

function isOnlyMissingDynamicContent(result: BrowserQaCheckResult) {
  return (
    !result.passed &&
    result.failures.length > 0 &&
    result.failures.every((failure) => failure.startsWith(MISSING_DYNAMIC_CONTENT))
  );
}

function dynamicParent(path: string) {
  const tokenIndex = path.search(/\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+/);
  if (tokenIndex === -1) return null;
  return path.slice(0, tokenIndex).replace(/\/+$/, "") || "/";
}

function isBlockedByMissingContent(
  result: BrowserQaCheckResult,
  allResults: BrowserQaCheckResult[],
  plan: QaPlan,
) {
  if (isOnlyMissingDynamicContent(result)) return true;
  if (
    result.passed ||
    result.failures.length !== 1 ||
    result.failures[0] !== "The workflow has no visible interactive control"
  ) {
    return false;
  }
  const missingParents = plan.checks.flatMap((check) => {
    const parent = dynamicParent(check.path);
    const checkResult = allResults.find((candidate) => candidate.id === check.id);
    return parent && checkResult && isOnlyMissingDynamicContent(checkResult) ? [parent] : [];
  });
  return missingParents.includes(result.path);
}

async function loadWixResources(workspace: Workspace): Promise<WixSiteResources> {
  const context = JSON.parse(await workspace.readFile(".factory/context/site.json")) as {
    wixResources?: WixSiteResources;
  };
  if (!context.wixResources)
    throw new Error("The generated site's Wix resource map is unavailable");
  return context.wixResources;
}

function contentTasks(
  specification: ReturnType<typeof parseProjectSpecification>,
  results: BrowserQaCheckResult[],
  siteId?: string,
) {
  const paths = [
    ...new Set(results.filter(isOnlyMissingDynamicContent).map((result) => result.path)),
  ];
  return paths.map((concretePath) => {
    const templatePath = concretePath.replace(/factory-qa/g, "{item}");
    const routeSegment = concretePath.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    const collection = specification.infrastructure.cmsCollections.find(
      (candidate) => candidate.name.toLowerCase() === routeSegment,
    );
    const fields = collection?.fields.map((field) => field.name).join(", ");
    return {
      taskKey: `qa-content:${collection?.name ?? templatePath}`,
      title: collection ? `Add content to ${collection.name}` : "Add content for the dynamic page",
      description: collection
        ? `Website testing could not open ${templatePath} because ${collection.name} has no published items. Add at least one real item${fields ? ` and complete the fields used by the page: ${fields}` : ""}.`
        : `Website testing could not open ${templatePath} because no published item links to it. Add at least one real item in Wix CMS.`,
      wixDashboardUrl: siteId ? cmsDashboardUrl(siteId) : undefined,
      blocking: true,
    };
  });
}

async function executeChecks(
  ctx: StageContext,
  dependencies: QaDependencies,
  plan: QaPlan,
  previewUrl: string,
  range: { start: number; end: number },
) {
  return await dependencies.qaService.run(plan, previewUrl, async ({ index, total, title }) => {
    const fraction = total === 0 ? 1 : index / total;
    const percent = range.start + Math.round(fraction * (range.end - range.start));
    await ctx.progress(percent, `Testing ${title} · ${index + 1} of ${total}`);
  });
}

async function reportChecks(
  ctx: StageContext,
  results: BrowserQaCheckResult[],
  repairedIds: Set<string>,
): Promise<QaReport["checks"]> {
  return await Promise.all(
    results.map(async (result) => ({
      id: result.id,
      title: result.title,
      path: result.path,
      status: result.passed
        ? repairedIds.has(result.id)
          ? ("repaired" as const)
          : ("passed" as const)
        : ("failed" as const),
      evidence: result.evidence,
      failures: result.failures,
      screenshotStorageId:
        result.screenshot.byteLength > 0
          ? await ctx.store.putBlob(result.screenshot, "image/png")
          : null,
    })),
  );
}

function reportSummary(checks: QaReport["checks"]): QaReport["summary"] {
  return {
    passed: checks.filter((check) => check.status === "passed").length,
    repaired: checks.filter((check) => check.status === "repaired").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

async function emitQaReport(
  ctx: StageContext,
  input: {
    plan: QaPlan;
    previewUrl: string;
    results: BrowserQaCheckResult[];
    repairedIds: Set<string>;
    repairAttempts: number;
  },
) {
  const checks = await reportChecks(ctx, input.results, input.repairedIds);
  const summary = reportSummary(checks);
  const status =
    summary.failed > 0 ? "needs_attention" : summary.repaired > 0 ? "repaired" : "passed";
  const report = WebsiteQaReport.parse({
    planHash: input.plan.planHash,
    previewUrl: input.previewUrl,
    status,
    repairAttempts: input.repairAttempts,
    summary,
    checks,
  });
  await ctx.emitArtifact("websiteQaReport", report, {
    promptHash: "",
    inputsHash: hashInputs({ plan: input.plan, previewUrl: input.previewUrl }),
  });
  return report;
}

export function createRunWebsiteQa(overrides: Partial<QaDependencies> = {}): StageHandler {
  return {
    stage: "RunningWebsiteQA",

    async run(ctx) {
      const dependencies: QaDependencies = {
        qaService: overrides.qaService ?? new PlaywrightWebsiteQaService(),
        codeGenerator: overrides.codeGenerator ?? new OpenAICodexGenerator(),
        githubService: overrides.githubService ?? new GitHubRestService(),
        wixService: overrides.wixService ?? new WixCliService(),
        workspace: overrides.workspace ?? new LocalWorkspace(ctx.projectId),
        validateIntegrations: overrides.validateIntegrations ?? validateGeneratedIntegrations,
      };
      await ctx.progress(5, "Preparing browser acceptance tests");
      const [specificationArtifact, requirementsArtifact, architectureArtifact, previewArtifact] =
        await Promise.all([
          ctx.store.getLatestApproved(ctx.projectId, "specification"),
          ctx.store.getLatestArtifact(ctx.projectId, "businessRequirements"),
          ctx.store.getLatestArtifact(ctx.projectId, "wixSolutionArchitecture"),
          ctx.store.getLatestArtifact(ctx.projectId, "preview"),
        ]);
      if (!specificationArtifact) throw new Error("The approved site plan is unavailable");
      if (!architectureArtifact) throw new Error("The Wix solution architecture is unavailable");
      if (!previewArtifact) throw new Error("The Wix preview is unavailable");
      const previewData = previewArtifact.data as { url?: unknown };
      if (typeof previewData.url !== "string")
        throw new Error("The Wix preview URL is unavailable");
      const specification = parseProjectSpecification(specificationArtifact.data);
      const requirements = requirementsArtifact
        ? BusinessRequirements.parse(requirementsArtifact.data)
        : null;
      const architecture = parseWixSolutionArchitecture(architectureArtifact.data);
      const wixResources = await loadWixResources(dependencies.workspace);
      let preview = {
        artifactId: previewArtifact.id,
        version: previewArtifact.version,
        url: previewData.url,
      };
      let permissionsChanged: boolean;
      try {
        permissionsChanged = await dependencies.wixService.ensureAppPermissions(
          requiredSpecificationAppPermissions(specification),
          dependencies.workspace,
          (message) => ctx.progress(7, message),
        );
      } catch (error) {
        if (error instanceof WixAccountConfigurationError) {
          return { kind: "failed", error: error.message, retryable: false };
        }
        throw error;
      }
      if (permissionsChanged) {
        await ctx.progress(8, "Refreshing the preview with the required Wix services");
        await dependencies.wixService.build(dependencies.workspace);
        const refreshedPreview = await dependencies.wixService.preview(
          dependencies.workspace,
          (message) => ctx.progress(9, message),
        );
        const refreshedArtifact = await ctx.emitArtifact("preview", refreshedPreview, {
          promptHash: "",
          inputsHash: hashInputs({
            sourcePreviewArtifactId: previewArtifact.id,
            wixPermissions: requiredSpecificationAppPermissions(specification),
          }),
        });
        preview = {
          artifactId: refreshedArtifact.id,
          version: refreshedArtifact.version,
          url: refreshedPreview.url,
        };
      }
      let plan = createWebsiteQaPlan({
        specification,
        architecture,
        requirements,
        specificationVersion: specificationArtifact.version,
        architectureVersion: architectureArtifact.version,
        previewVersion: preview.version,
      });
      await ctx.emitArtifact("websiteQaPlan", plan, {
        promptHash: "",
        inputsHash: plan.planHash,
      });

      let results = await executeChecks(ctx, dependencies, plan, preview.url, {
        start: 10,
        end: 58,
      });
      const requiredPermissions = requiredSpecificationAppPermissions(specification);
      if (ctx.wix?.appId && likelyNeedsWixAppPermissionUpdate(results, requiredPermissions)) {
        await emitQaReport(ctx, {
          plan,
          previewUrl: preview.url,
          results,
          repairedIds: new Set(),
          repairAttempts: 0,
        });
        const tasks = [
          {
            taskKey: `wix-app-permissions:${ctx.wix.appId}:${hashInputs(requiredPermissions)}`,
            title: "Approve the generated app's Wix permissions",
            description:
              "Wix CMS and the other required services are connected, but this site is still rejecting the generated app's access. Open Wix, review and approve the app update, then return here and mark this complete.",
            wixDashboardUrl: appInstallerUrl(ctx.wix.appId),
            blocking: true as const,
          },
        ];
        const checklistKey = hashInputs({
          kind: "wix-app-permissions",
          appId: ctx.wix.appId,
          requiredPermissions,
        });
        const priorTasks = await ctx.store.getManualTaskStatuses(ctx.projectId, checklistKey);
        if (priorTasks.some((task) => task.completed)) {
          return {
            kind: "failed",
            error:
              "Wix still rejects the generated app after its permission update was marked complete. Open the Wix app update again, confirm it for this site, then retry this step.",
            retryable: false,
          };
        }
        await ctx.progress(60, "Waiting for Wix app access approval");
        return { kind: "manualTasks", checklistKey, tasks };
      }
      const initiallyFailed = new Set(
        results.filter((result) => !result.passed).map((result) => result.id),
      );
      let staticValidationFailure: string | null = null;
      try {
        await dependencies.validateIntegrations(
          dependencies.workspace,
          wixResources,
          specification,
        );
      } catch (error) {
        staticValidationFailure = error instanceof Error ? error.message : String(error);
      }
      const repairableFailures = results.filter(
        (result) => !result.passed && !isBlockedByMissingContent(result, results, plan),
      );
      let repairAttempts = 0;
      if (repairableFailures.length > 0 || staticValidationFailure) {
        repairAttempts = 1;
        const repairCount = repairableFailures.length + (staticValidationFailure ? 1 : 0);
        await ctx.progress(62, `Repairing ${repairCount} failed website checks`);
        const repairPrompt = loadPrompt("qa-repair");
        const failures = repairableFailures.map((result) => ({
          id: result.id,
          title: result.title,
          path: result.path,
          failures: result.failures,
        }));
        if (staticValidationFailure) {
          failures.push({
            id: "static-integration",
            title: "Wix integration contract",
            path: "source",
            failures: [staticValidationFailure],
          });
        }
        const generated = await dependencies.codeGenerator.build(
          {
            task: `${repairPrompt.text}\n\nFailed browser checks:\n${JSON.stringify(failures, null, 2)}`,
            specification,
            screens: [],
          },
          dependencies.workspace,
          (message) => ctx.progress(66, message),
        );
        await formatGeneratedSource(dependencies.workspace);
        await dependencies.validateIntegrations(
          dependencies.workspace,
          wixResources,
          specification,
        );
        await dependencies.wixService.build(dependencies.workspace);
        await dependencies.githubService.commitAndPush(
          dependencies.workspace,
          "fix: repair browser acceptance failures",
        );
        await ctx.progress(72, "Creating a preview of the repairs");
        const repairedPreview = await dependencies.wixService.preview(dependencies.workspace);
        const repairedArtifact = await ctx.emitArtifact("preview", repairedPreview, {
          promptHash: hashInputs({ code: generated.promptHash, repair: repairPrompt.hash }),
          inputsHash: hashInputs({ plan, failures }),
        });
        preview = {
          artifactId: repairedArtifact.id,
          version: repairedArtifact.version,
          url: repairedPreview.url,
        };
        plan = createWebsiteQaPlan({
          specification,
          architecture,
          requirements,
          specificationVersion: specificationArtifact.version,
          architectureVersion: architectureArtifact.version,
          previewVersion: preview.version,
        });
        await ctx.emitArtifact("websiteQaPlan", plan, {
          promptHash: "",
          inputsHash: plan.planHash,
        });
        results = await executeChecks(ctx, dependencies, plan, preview.url, {
          start: 76,
          end: 94,
        });
      }

      const repairedIds = new Set(
        results
          .filter((result) => result.passed && initiallyFailed.has(result.id))
          .map((result) => result.id),
      );
      const report = await emitQaReport(ctx, {
        plan,
        previewUrl: preview.url,
        results,
        repairedIds,
        repairAttempts,
      });
      if (report.summary.failed > 0) {
        const failedResults = results.filter((result) => !result.passed);
        if (
          failedResults.length > 0 &&
          failedResults.every((result) => isBlockedByMissingContent(result, results, plan))
        ) {
          const tasks = contentTasks(specification, failedResults, ctx.wix?.siteId);
          const checklistKey = hashInputs({
            kind: "qa-content",
            specificationArtifactId: specificationArtifact.id,
            tasks,
          });
          const priorTasks = await ctx.store.getManualTaskStatuses(ctx.projectId, checklistKey);
          if (priorTasks.some((task) => task.completed)) {
            return {
              kind: "failed",
              error: "The required Wix CMS content is still missing after it was marked complete",
              retryable: false,
            };
          }
          await ctx.progress(98, "Waiting for content needed to test the dynamic pages");
          return { kind: "manualTasks", checklistKey, tasks };
        }
        const failedTitles = report.checks
          .filter((check) => check.status === "failed")
          .slice(0, 3)
          .map((check) => check.title)
          .join(", ");
        return {
          kind: "failed",
          error: `${report.summary.failed} website check${report.summary.failed === 1 ? "" : "s"} still need attention: ${failedTitles}`,
          retryable: false,
        };
      }
      await ctx.progress(98, "Website checks passed");
      return {
        kind: "websiteQaCompleted",
        previewArtifactId: preview.artifactId,
        previewVersion: preview.version,
        previewUrl: preview.url,
      };
    },
  };
}

export const runWebsiteQa = createRunWebsiteQa();
