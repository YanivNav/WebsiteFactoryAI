/** Atomic queue operations used by the background worker. */
import {isRunnableStage, STAGES} from "@factory/shared";
import {v} from "convex/values";
import {mutation, query} from "./_generated/server";
import {artifactTypeValidator, stageValidator} from "./schema";
import {resolveArtifact} from "./utils";

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
    data: v.any()
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db.query('artifacts')
      .withIndex('by_project_and_type', q => q.eq('projectId', input.projectId).eq('type', input.type))
      .collect();
    const project = await ctx.db.get('projects', input.projectId);
    if (!project) return;

    const version = existing.length + 1;
    const artifactId = await ctx.db.insert('artifacts', {
      ...input,
      version,
      planningCycle: project.planningCycle,
      assets: []
    });

    return {artifactId, version};
  }
});

export const updateArtifact = mutation({
  args: {
    artifactId: v.id('artifacts'),
    data: v.any()
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db.get('artifacts', input.artifactId);
    if (!existing) return;

    const artifactId = await ctx.db.patch('artifacts', input.artifactId, {
      data: input.data
    });

    return {artifactId};
  }
});


export const setProgress = mutation({
  args: {projectId: v.id('projects'), progress: v.number()},
  handler: async (ctx, args) => {
    await ctx.db.patch('projects', args.projectId, {
      progress: args.progress
    });
  }
});

export const getLatestArtifact = query({
  args: {
    projectId: v.id('projects'),
    type: artifactTypeValidator
  },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db.query('artifacts')
      .withIndex('by_project_and_type', q => q.eq('projectId', args.projectId).eq('type', args.type))
      .collect();
    const sorted = artifacts
      .toSorted((a, b) => b.version - a.version);
    if (!sorted.length) return;
    return resolveArtifact(ctx, sorted[0]);
  }
});

export const commitResult = mutation({
  args: {
    projectId: v.id('projects'),
    workerId: v.string(),
    result: v.union(
      v.object({kind: v.literal('advance'), next: stageValidator}),
      v.object({kind: v.literal('error'), error: v.string()})
    )
  },
  handler: async (ctx, {projectId, workerId, result}) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");

    if (project.leaseWorkerId !== workerId) return;

    const releaseLease = { leaseWorkerId: undefined, leaseExpiresAt: undefined };

    if (result.kind === "advance") {
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        progress: 0,
        status: result.next === "Completed" ? "completed" : "active",
      });
      return;
    } else {
      await ctx.db.patch(projectId, {
        ...releaseLease,
        progress: 0,
        lastError: result.error
      })
    }
  }
})