import assert from "node:assert/strict";
import test from "node:test";
import { nextStage, type SolutionArchitecture, type Specification } from "@factory/shared";
import type { CodeGenerator } from "../services/code";
import type { GitHubService } from "../services/github";
import type { BrowserQaCheckResult, WebsiteQaService } from "../services/qa";
import { WixAccountConfigurationError, type WixService } from "../services/wix";
import type { Workspace } from "../workspace";
import type { ProjectStore } from "../store";
import { createRunWebsiteQa } from "./runWebsiteQa.js";
import type { StageContext } from "./types.js";

const specification: Specification = {
  summary: "A simple school site",
  pages: [
    {
      title: "Home",
      path: "/",
      description: "School overview",
      sections: [{ type: "hero", description: "Introduction" }],
    },
    {
      title: "Course",
      path: "/courses/{slug}",
      description: "Course detail",
      sections: [{ type: "features", description: "Course information" }],
    },
  ],
  infrastructure: {
    cmsCollections: [],
    wixBusinessSolutions: [],
    visitorWorkflows: [
      {
        id: "view_courses",
        name: "View courses",
        description: "Open a course detail page",
        dynamicContext: "course",
        inputs: [],
        actions: [
          {
            type: "notifySiteTeam",
            description: "Record course navigation analytics",
            requiresManualSetup: false,
            requiredConfiguration: [],
          },
        ],
        successResult: "A course detail page opens",
      },
    ],
  },
};

const architecture: SolutionArchitecture = {
  summary: "Simple Wix site",
  businessSolutions: [],
  journeySolutions: [],
  cmsCollections: [],
  risks: [],
};

function check(passed: boolean): BrowserQaCheckResult {
  return {
    id: "route-home",
    title: "Home page",
    path: "/",
    passed,
    durationMs: 10,
    evidence: passed ? ["Page loaded"] : [],
    failures: passed ? [] : ["Primary heading missing"],
    screenshot: new Uint8Array(),
  };
}

function harness(
  runs: BrowserQaCheckResult[][],
  permissionsChanged = false,
  permissionError?: Error,
  testedSpecification: Specification = specification,
) {
  const emitted: Array<{ type: string; data: unknown }> = [];
  let qaRun = 0;
  const versions = new Map<string, number>([["preview", 1]]);
  const store = {
    getLatestApproved: async (_projectId: string, type: string) =>
      type === "specification"
        ? { id: "spec-1", type, version: 1, data: testedSpecification }
        : null,
    getLatestArtifact: async (_projectId: string, type: string) => {
      if (type === "wixSolutionArchitecture") {
        return { id: "architecture-1", type, version: 1, data: architecture };
      }
      if (type === "preview") {
        return { id: "preview-1", type, version: 1, data: { url: "https://preview.example/" } };
      }
      return null;
    },
    putBlob: async () => "screenshot-1",
    getManualTaskStatuses: async () => [],
  } as unknown as ProjectStore;
  const ctx = {
    projectId: "project-1",
    projectTitle: "School",
    stage: "RunningWebsiteQA",
    brief: "School site",
    mode: "simple",
    settings: { publishTarget: "wix-managed" },
    attempts: 0,
    wix: { siteId: "site-1", appId: "app-1" },
    store,
    log: async () => undefined,
    progress: async () => undefined,
    emitArtifact: async (type: string, data: unknown) => {
      emitted.push({ type, data });
      const version = (versions.get(type) ?? 0) + 1;
      versions.set(type, version);
      return { id: `${type}-${version}`, version };
    },
  } as StageContext;
  const qaService: WebsiteQaService = {
    run: async () => runs[Math.min(qaRun++, runs.length - 1)]!,
  };
  const workspace = {
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    readFile: async () =>
      JSON.stringify({
        wixResources: { cmsCollections: [], formsMode: "customCrm", forms: [], media: [] },
      }),
  } as unknown as Workspace;
  const codeGenerator = {
    build: async () => ({ summary: "Repaired", promptHash: "code", model: "test" }),
  } as CodeGenerator;
  const githubService = {
    commitAndPush: async () => "revision-2",
  } as unknown as GitHubService;
  const wixService = {
    ensureAppPermissions: async () => {
      if (permissionError) throw permissionError;
      return permissionsChanged;
    },
    build: async () => undefined,
    preview: async () => ({ url: "https://preview.example/repaired" }),
  } as unknown as WixService;
  return {
    ctx,
    emitted,
    handler: createRunWebsiteQa({
      qaService,
      workspace,
      codeGenerator,
      githubService,
      wixService,
      validateIntegrations: async () => undefined,
    }),
  };
}

test("passing browser evidence exposes exactly the tested preview for review", async () => {
  const { ctx, emitted, handler } = harness([[check(true)]]);

  const result = await handler.run(ctx);

  assert.deepEqual(result, {
    kind: "websiteQaCompleted",
    previewArtifactId: "preview-1",
    previewVersion: 1,
    previewUrl: "https://preview.example/",
  });
  assert.deepEqual(
    emitted.map((artifact) => artifact.type),
    ["websiteQaPlan", "websiteQaReport"],
  );
});

test("new Wix app permissions force a fresh preview before browser proof", async () => {
  const { ctx, emitted, handler } = harness([[check(true)]], true);

  const result = await handler.run(ctx);

  assert.deepEqual(result, {
    kind: "websiteQaCompleted",
    previewArtifactId: "preview-2",
    previewVersion: 2,
    previewUrl: "https://preview.example/repaired",
  });
  assert.deepEqual(
    emitted.map((artifact) => artifact.type),
    ["preview", "websiteQaPlan", "websiteQaReport"],
  );
});

test("Wix account configuration failures stop automatic QA retries", async () => {
  const { ctx, emitted, handler } = harness(
    [[check(true)]],
    false,
    new WixAccountConfigurationError("Configure Wix account access"),
  );

  const result = await handler.run(ctx);

  assert.deepEqual(result, {
    kind: "failed",
    error: "Configure Wix account access",
    retryable: false,
  });
  assert.deepEqual(emitted, []);
});

test("shared Wix runtime failures pause for the documented app permission update", async () => {
  const wixSpecification: Specification = {
    ...specification,
    infrastructure: {
      ...specification.infrastructure,
      cmsCollections: [
        {
          name: "Courses",
          description: "Published course content",
          fields: [
            {
              name: "title",
              type: "text",
              description: null,
              referencedCollection: null,
            },
          ],
        },
      ],
      visitorWorkflows: [
        {
          ...specification.infrastructure.visitorWorkflows[0]!,
          actions: [
            {
              type: "createOrUpdateContact",
              description: "Save an enquiry contact",
              requiresManualSetup: false,
              requiredConfiguration: [],
            },
          ],
        },
      ],
    },
  };
  const sharedPageFailure = (id: string, title: string, path: string): BrowserQaCheckResult => ({
    ...check(false),
    id,
    title,
    path,
    failures: ["Page displays an error: Content is temporarily unavailable"],
  });
  const workflowFailure: BrowserQaCheckResult = {
    ...check(false),
    id: "workflow-contact",
    title: "Contact",
    path: "/contact",
    failures: ["The workflow request failed with status 500"],
  };
  const { ctx, handler } = harness(
    [
      [
        sharedPageFailure("route-home", "Home", "/"),
        sharedPageFailure("route-courses", "Courses", "/courses"),
        workflowFailure,
      ],
    ],
    false,
    undefined,
    wixSpecification,
  );

  const result = await handler.run(ctx);

  assert.equal(result.kind, "manualTasks");
  if (result.kind === "manualTasks") {
    assert.equal(result.tasks[0]?.title, "Approve the generated app's Wix permissions");
    assert.equal(result.tasks[0]?.wixDashboardUrl, "https://wix.com/app-installer?appId=app-1");
  }
});

test("missing dynamic CMS content pauses for a content task instead of repairing code", async () => {
  const missingContent: BrowserQaCheckResult = {
    ...check(false),
    id: "route-courses-slug",
    title: "Course page",
    path: "/courses/factory-qa",
    failures: ["No published website link matched the dynamic route /courses/{slug}"],
  };
  const missingParentControl: BrowserQaCheckResult = {
    ...check(false),
    id: "workflow-view-courses",
    title: "View courses",
    path: "/courses",
    failures: ["The workflow has no visible interactive control"],
  };
  const { ctx, handler } = harness([[missingContent, missingParentControl]]);

  const result = await handler.run(ctx);

  assert.equal(result.kind, "manualTasks");
  if (result.kind === "manualTasks") {
    assert.equal(result.tasks.length, 1);
    assert.match(result.tasks[0]?.description ?? "", /no published item/i);
  }
});

test("preview creation must pass browser QA before final approval", () => {
  assert.equal(nextStage("GeneratingPreview", "simple"), "RunningWebsiteQA");
  assert.equal(nextStage("RunningWebsiteQA", "simple"), "WaitingForFinalApproval");
});

test("failed checks receive one repair and a fresh preview before review", async () => {
  const { ctx, emitted, handler } = harness([[check(false)], [check(true)]]);

  const result = await handler.run(ctx);
  const report = emitted.find((artifact) => artifact.type === "websiteQaReport")?.data as {
    status?: string;
    summary?: { repaired?: number };
  };

  assert.deepEqual(result, {
    kind: "websiteQaCompleted",
    previewArtifactId: "preview-2",
    previewVersion: 2,
    previewUrl: "https://preview.example/repaired",
  });
  assert.equal(report.status, "repaired");
  assert.equal(report.summary?.repaired, 1);
  assert.deepEqual(
    emitted.map((artifact) => artifact.type),
    ["websiteQaPlan", "preview", "websiteQaPlan", "websiteQaReport"],
  );
});
