import { ARTIFACT_TYPES, PHASES } from "@factory/shared";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const artifactTypeValidator = v.union(...ARTIFACT_TYPES.map((type) => v.literal(type)));

export const phaseValidator = v.union(...PHASES.map((phase) => v.literal(phase)));

export const revisionValidator = v.object({
  mode: v.union(v.literal("initial"), v.literal("regenerate"), v.literal("revise")),
  baseArtifactId: v.optional(v.id("artifacts")),
  feedback: v.optional(v.string()),
  // When set, the revision targets a single design screen (by page path) rather
  // than the whole artifact.
  screenPath: v.optional(v.string()),
  // When set, a site-build revision bakes in this owner-content version (the
  // refine loop's content-edit path). Carried on the revision rather than as a
  // work input so the standard input contract stays stable.
  contentArtifactId: v.optional(v.id("artifacts")),
  // When true, a site-build reverts the generated code to the fresh scaffold
  // before rebuilding — a clean regeneration in the same project.
  cleanRebuild: v.optional(v.boolean()),
  // When set, restore the site's code to this git commit instead of generating
  // (git is the source of truth for site versions).
  revertToCommit: v.optional(v.string()),
  // When true, skip code generation and only start the dev server.
  devOnly: v.optional(v.boolean()),
  // When true, build the site and generate a fresh preview URL.
  previewOnly: v.optional(v.boolean()),
  // When true, stop the project's running dev server.
  stopDev: v.optional(v.boolean()),
});

export const userTaskResultValidator = v.union(
  v.object({ type: v.literal("selectVersion") }),
  v.object({
    type: v.literal("submitArtifact"),
    artifactType: artifactTypeValidator,
  }),
);

export const artifactInputValidator = v.object({
  source: v.literal("artifact"),
  artifactType: artifactTypeValidator,
  artifactId: v.id("artifacts"),
});

export const workInstructionValidator = v.object({
  type: v.string(),
  inputs: v.record(v.string(), artifactInputValidator),
  revision: v.optional(revisionValidator),
});

const assetSchema = v.object({
  id: v.string(),
  data: v.any(),
  storageId: v.id("_storage"),
});

export default defineSchema({
  projects: defineTable({
    title: v.string(),
    owner: v.string(),
    currentActivity: v.union(
      v.object({ type: v.literal("draft") }),
      v.object({ type: v.literal("work"), workId: v.id("works") }),
      v.object({ type: v.literal("userTask"), userTaskId: v.id("userTasks") }),
      v.object({ type: v.literal("ready") }),
      v.object({ type: v.literal("completed") }),
    ),
    approvedArtifacts: v.record(v.string(), v.id("artifacts")),
    settings: v.object({
      mode: v.union(v.literal("simple"), v.literal("developer")),
      publishTarget: v.union(v.literal("wix-managed"), v.literal("custom")),
      businessName: v.optional(v.string()),
    }),
    wix: v.optional(
      v.object({
        projectId: v.optional(v.string()),
        siteId: v.optional(v.string()),
        appId: v.optional(v.string()),
        liveUrl: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        previewDashboardUrl: v.optional(v.string()),
        devUrl: v.optional(v.string()),
        dashboardUrl: v.optional(v.string()),
      }),
    ),
    github: v.optional(
      v.object({
        owner: v.string(),
        name: v.string(),
        defaultBranch: v.string(),
      }),
    ),
  }).index("by_owner", ["owner"]),

  works: defineTable({
    projectId: v.id("projects"),
    phase: phaseValidator,
    label: v.string(),
    instruction: workInstructionValidator,
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    attempt: v.number(),
    leaseWorkerId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    outputArtifactIds: v.array(v.id("artifacts")),
    error: v.optional(
      v.object({
        message: v.string(),
        technicalDetails: v.optional(v.string()),
        code: v.optional(v.string()),
        retryable: v.boolean(),
        occurredAt: v.number(),
      }),
    ),
  })
    .index("by_status", ["status"])
    .index("by_project", ["projectId"]),

  userTasks: defineTable({
    projectId: v.id("projects"),
    phase: phaseValidator,
    label: v.string(),
    subjectArtifactId: v.id("artifacts"),
    previousResultArtifactId: v.optional(v.id("artifacts")),
    result: userTaskResultValidator,
    status: v.union(v.literal("open"), v.literal("completed"), v.literal("cancelled")),
    chosenSubjectArtifactId: v.optional(v.id("artifacts")),
    resultArtifactId: v.optional(v.id("artifacts")),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  artifacts: defineTable({
    projectId: v.id("projects"),
    type: artifactTypeValidator,
    version: v.number(),
    data: v.any(),
    assets: v.array(assetSchema),
    basedOnArtifactId: v.optional(v.id("artifacts")),
    createdByWorkId: v.optional(v.id("works")),
    createdByUserTaskId: v.optional(v.id("userTasks")),
    outputKey: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_type", ["projectId", "type"])
    .index("by_work", ["createdByWorkId"])
    .index("by_work_and_output", ["createdByWorkId", "outputKey"]),

  workProgress: defineTable({
    projectId: v.id("projects"),
    workId: v.id("works"),
    attempt: v.number(),
    percent: v.number(),
    message: v.string(),
    data: v.optional(v.any()),
  })
    .index("by_work", ["workId"])
    .index("by_work_and_attempt", ["workId", "attempt"]),

  // Per-screen revision requests raised while a design work is still running. The
  // running handler drains pending rows after each screen and regenerates them.
  screenRevisions: defineTable({
    projectId: v.id("projects"),
    workId: v.id("works"),
    screenPath: v.string(),
    feedback: v.string(),
    status: v.union(v.literal("pending"), v.literal("claimed")),
  }).index("by_work_and_status", ["workId", "status"]),

  logs: defineTable({
    projectId: v.id("projects"),
    workId: v.optional(v.id("works")),
    userTaskId: v.optional(v.id("userTasks")),
    attempt: v.optional(v.number()),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  }).index("by_project", ["projectId"]),

  // A project's dev server, as live state the UI renders (one small doc per
  // project, patched through starting → running → stopped/error). Kept out of
  // the projects doc so the worker's frequent writes don't contend with it.
  devSessions: defineTable({
    projectId: v.id("projects"),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("error"),
    ),
    url: v.optional(v.string()),
    workerId: v.optional(v.string()),
    exitReason: v.optional(v.string()),
    startedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Streamed dev-server output (the Astro logs). Append-only narration in its own
  // table — cleared when a session (re)starts, tailed by the reader.
  devLogs: defineTable({
    projectId: v.id("projects"),
    stream: v.union(v.literal("out"), v.literal("err")),
    line: v.string(),
  }).index("by_project", ["projectId"]),
});
