/** Atomic queue operations used by the background worker. */
import { isRunnableStage, STAGES } from "@factory/shared";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import {artifactTypeValidator, stageValidator} from "./schema";
import {ARTIFACT_TYPES} from "../packages/shared/src/artifacts";

const RUNNABLE_STAGES = STAGES.filter(isRunnableStage);

export const leaseNextRunnable = mutation({
  args: { workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { workerId, ttlSeconds }) => {
    const now = Date.now();

    for (const stage of RUNNABLE_STAGES) {
      const candidates = await ctx.db
        .query("projects")
        .withIndex("by_stage", (q) => q.eq("currentStage", stage))
        .collect();
      const project = candidates.find(
        (candidate) =>
          candidate.status === "active" &&
          (candidate.leaseWorkerId === undefined || (candidate.leaseExpiresAt ?? 0) < now),
      );
      if (!project) continue;

      await ctx.db.patch(project._id, {
        leaseWorkerId: workerId,
        leaseExpiresAt: now + ttlSeconds * 1000,
      });

      return {
        id: project._id,
        title: project.title,
        currentStage: project.currentStage,
        settings: project.settings,
      };
    }

    return null;
  },
});

export const renewLease = mutation({
  args: { projectId: v.id("projects"), workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { projectId, workerId, ttlSeconds }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.leaseWorkerId !== workerId) return;
    await ctx.db.patch(projectId, { leaseExpiresAt: Date.now() + ttlSeconds * 1000 });
  },
});

export const appendLog = mutation({
  args: {
    projectId: v.id("projects"),
    stage: stageValidator,
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, input) => {
    await ctx.db.insert("logs", input);
  },
});

export const addArtifact = mutation({
  args: {
    projectId: v.id('projects'),
    type: artifactTypeValidator,
    stage: stageValidator,
    name: v.string(),
    data: v.any(),
    planningCycle: v.number()
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db.query('artifacts')
      .withIndex('by_project_and_type', q => q.eq('projectId', input.projectId).eq('type', input.type))
      .collect();

    const version = existing.length + 1;
    const artifactId = await ctx.db.insert('artifacts', {
      ...input,
      version,
      assets: []
    });

    return {artifactId, version};
  }
});