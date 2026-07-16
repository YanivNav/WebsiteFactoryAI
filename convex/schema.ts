/**
 * Convex is the state store, and the ONLY source of truth.
 *
 * What lives here is *durable input* — brief, specification, design, approvals,
 * stage. The generated website repository is *derived state*: a function of
 * (specification + design + config), reconstructible at any time. Losing a workspace
 * loses a cache, not a project.
 *
 * The application must survive refreshes, restarts, and interruptions, because all
 * progress lives here and never in memory.
 *
 * NOTE THE SHAPE — it encodes the OCC guardrail from CLAUDE.md:
 * `logs` is a separate append-only table precisely so the worker never has to
 * hot-write the `projects` document while the dashboard is reading it.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stageValidator = v.union(
  v.literal("Draft"),
  v.literal("GeneratingQuestions"),
  v.literal("WaitingForAnswers"),
  v.literal("GeneratingSpecification"),
  v.literal("WaitingForSpecificationApproval"),
  v.literal("GeneratingDesign"),
  v.literal("WaitingForDesignApproval"),
  v.literal("ProvisioningWix"),
  v.literal("WaitingForManualActions"),
  v.literal("GeneratingCode"),
  v.literal("WaitingForCodeReview"),
  v.literal("RunningChecks"),
  v.literal("GeneratingPreview"),
  v.literal("WaitingForFinalApproval"),
  v.literal("Publishing"),
  v.literal("Completed"),
);

export const artifactTypeValidator = v.union(
  v.literal("brief"),
  v.literal("questions"),
  v.literal("answers"),
  v.literal("specification"),
  v.literal("design"),
  v.literal("buildReport"),
  v.literal("preview"),
  v.literal("releaseReport"),
);

export default defineSchema({
  projects: defineTable({
    title: v.string(),
    owner: v.string(),
    status: v.union(v.literal("active"), v.literal("failed"), v.literal("completed")),
    currentStage: stageValidator,
    brief: v.string(),
    settings: v.object({
      mode: v.union(v.literal("simple"), v.literal("developer")),
      publishTarget: v.union(v.literal("wix-managed"), v.literal("custom")),
      businessName: v.optional(v.string()),
      siteTemplate: v.optional(v.string()),
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
        cloneUrl: v.string(),
        htmlUrl: v.string(),
        defaultBranch: v.string(),
      }),
    ),
    // The atomic lease. This is what prevents two workers from executing the same
    // stage — and the same serialization is what makes the change-request queue
    // conflict-free, because there is only ever one writer per project.
    leaseWorkerId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    attempts: v.number(),
    lastError: v.optional(v.string()),
  })
    // Leasing scans by stage, so index it. `by_stage_lease` lets the worker find
    // "runnable stage, and either unleased or the lease has expired" cheaply.
    .index("by_stage", ["currentStage"])
    .index("by_owner", ["owner"]),

  // Append-only. NEVER overwrite. A rejected specification produces v2 — it does not
  // mutate v1. `promptHash` + `inputsHash` are what make "deterministic from its
  // inputs" an enforceable claim rather than a hopeful one.
  artifacts: defineTable({
    projectId: v.id("projects"),
    type: artifactTypeValidator,
    version: v.number(),
    data: v.any(),
    storageId: v.optional(v.id("_storage")), // blobs never live inside documents
    promptHash: v.string(),
    inputsHash: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_type", ["projectId", "type"]),

  reviews: defineTable({
    projectId: v.id("projects"),
    artifactId: v.id("artifacts"),
    artifactType: artifactTypeValidator,
    version: v.number(),
    status: v.union(
      v.literal("waiting"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("needs_changes"),
    ),
    // Structured feedback. `screen` present ⇒ the comment targets one design screen.
    // The string arm exists only for legacy dev data — `normalizeReviewFeedback`
    // upgrades it at the read boundary; new writes are always structured objects.
    comments: v.array(
      v.union(
        v.string(),
        v.object({
          comment: v.string(),
          screen: v.optional(v.object({ screenId: v.string(), pageTitle: v.string() })),
        }),
      ),
    ),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_artifact", ["artifactId"]),

  manualTasks: defineTable({
    projectId: v.id("projects"),
    stage: stageValidator,
    title: v.string(),
    description: v.string(),
    // Deep link into the exact Wix dashboard page. The user knows the Wix dashboard
    // cold — send them somewhere they recognise, never "run this command".
    wixDashboardUrl: v.optional(v.string()),
    blocking: v.boolean(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"]),

  // The collaboration queue. Two people on two computers submit changes here; the
  // worker's lease serializes them against one workspace. One writer, always — so
  // merge conflicts are structurally impossible and never need resolving.
  changeRequests: defineTable({
    projectId: v.id("projects"),
    description: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    requestedBy: v.string(),
  }).index("by_project_status", ["projectId", "status"]),

  // Live design-generation progress: one document per screen, patched in place as the
  // worker moves it queued → generating → ready. A dedicated table because this is
  // STATE the dashboard renders, not chatter — deriving it from log messages is
  // banned. One row per screen keeps worker writes off the `projects` document
  // (the OCC guardrail), exactly like `logs`.
  designProgress: defineTable({
    projectId: v.id("projects"),
    order: v.number(),
    pageTitle: v.string(),
    pagePath: v.string(),
    status: v.union(v.literal("queued"), v.literal("generating"), v.literal("ready")),
    screenshotStorageId: v.optional(v.id("_storage")),
  }).index("by_project", ["projectId"]),

  // Structured logs — the user-facing ACTIVITY FEED, and nothing more. Logs are
  // write-only narration: no reader may branch on a log's message or `data` to
  // reconstruct state. Anything the UI must know goes in a real table (see
  // `designProgress`). Raw output stays here, behind "Technical details".
  logs: defineTable({
    projectId: v.id("projects"),
    stage: stageValidator,
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  }).index("by_project", ["projectId"]),

  stageRuns: defineTable({
    projectId: v.id("projects"),
    stage: stageValidator,
    attempt: v.number(),
    status: v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_project", ["projectId"]),
});
