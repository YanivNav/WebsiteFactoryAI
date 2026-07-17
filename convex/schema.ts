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
import {STAGES} from "@factory/shared";

export const stageValidator = v.union(
  ...STAGES.map(stage => v.literal(stage))
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
    // The atomic lease. This is what prevents two workers from executing the same
    // stage — and the same serialization is what makes the change-request queue
    // conflict-free, because there is only ever one writer per project.
    leaseWorkerId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    // Incremented when the user deliberately starts planning again from the brief.
    // Old artifacts stay append-only, but planning stages only reuse artifacts from
    // the current cycle.
    planningCycle: v.number(),
    progress: v.optional(v.object({
      step: v.number(),
      total: v.number()
    }))
  })
    .index("by_stage", ["currentStage"])
    .index("by_owner", ["owner"]),

  artifacts: defineTable({
    projectId: v.id("projects"),
    stage: stageValidator,
    planningCycle: v.number(),
    version: v.number(),
    data: v.any(),
    storageId: v.optional(v.id("_storage")), // blobs never live inside documents
    promptHash: v.string(),
    inputsHash: v.string(),
  }).index("by_project", ["projectId"]),

  logs: defineTable({
    projectId: v.id("projects"),
    stage: stageValidator,
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  }).index("by_project", ["projectId"]),


});
