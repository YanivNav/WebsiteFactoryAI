/** Atomic queue operations used by the background worker. */
import { isRunnableStage, STAGES } from "@factory/shared";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { stageValidator } from "./schema";

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
          candidate.attempts < 3 &&
          (candidate.leaseWorkerId === undefined || (candidate.leaseExpiresAt ?? 0) < now),
      );
      if (!project) continue;

      await ctx.db.patch(project._id, {
        leaseWorkerId: workerId,
        leaseExpiresAt: now + ttlSeconds * 1000,
      });
      await ctx.db.insert("stageRuns", {
        projectId: project._id,
        stage: project.currentStage,
        attempt: project.attempts + 1,
        status: "running",
        startedAt: now,
      });

      return {
        id: project._id,
        title: project.title,
        currentStage: project.currentStage,
        brief: project.brief,
        settings: project.settings,
        attempts: project.attempts,
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

async function finishStageRun(
  ctx: { db: any },
  project: Doc<"projects">,
  status: "succeeded" | "failed",
  error?: string,
) {
  const runs = await ctx.db
    .query("stageRuns")
    .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
    .collect();
  const run = runs.filter((candidate: Doc<"stageRuns">) => candidate.status === "running").pop();
  if (run) await ctx.db.patch(run._id, { status, finishedAt: Date.now(), error });
}

export const commitResult = mutation({
  args: {
    projectId: v.id("projects"),
    workerId: v.string(),
    result: v.union(
      v.object({ kind: v.literal("advance"), next: stageValidator }),
      v.object({ kind: v.literal("failed"), error: v.string(), retryable: v.boolean() }),
    ),
  },
  handler: async (ctx, { projectId, workerId, result }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (project.leaseWorkerId !== workerId) return;

    const releaseLease = { leaseWorkerId: undefined, leaseExpiresAt: undefined };
    if (result.kind === "advance") {
      await finishStageRun(ctx, project, "succeeded");
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        status: result.next === "Completed" ? "completed" : "active",
        attempts: 0,
        lastError: undefined,
      });
      return;
    }

    await finishStageRun(ctx, project, "failed", result.error);
    const attempts = result.retryable ? project.attempts + 1 : 3;
    await ctx.db.patch(projectId, {
      ...releaseLease,
      attempts,
      lastError: result.error,
      status: attempts >= 3 ? "failed" : "active",
    });
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
