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
});
