/**
 * The queue. Everything the background worker needs, and nothing else.
 *
 * These functions are deliberately MECHANICAL: claim a project, record what happened,
 * release it. There is no business logic here beyond the pure `nextStage()` from
 * @factory/shared. That constraint is what keeps a future Postgres port a mechanical
 * translation rather than a rewrite — see the portability guardrails in CLAUDE.md.
 */

import { v } from "convex/values";
import { isRunnableStage, nextStage, STAGES, type Stage } from "@factory/shared";
import { mutation } from "./_generated/server";
import { stageValidator } from "./schema";
import type { Doc } from "./_generated/dataModel";

const RUNNABLE_STAGES = STAGES.filter(isRunnableStage);

/**
 * Atomically claim one project sitting in a runnable stage.
 *
 * Convex mutations are serializable transactions, so the read-then-write below is
 * atomic: two workers can never claim the same project. Everything about crash-safety
 * rests on that.
 *
 * A lease that has EXPIRED is reclaimable. That is the entire crash-recovery story:
 * if a worker dies mid-stage, its lease simply goes stale and the next worker picks
 * the project up exactly where it was. No cleanup process, no orphan detection.
 */
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
        (p) =>
          p.status === "active" &&
          (p.leaseWorkerId === undefined ||
            (p.leaseExpiresAt ?? 0) < now), // stale lease → reclaim
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
        currentStage: project.currentStage,
        brief: project.brief,
        settings: project.settings,
        attempts: project.attempts,
      };
    }

    return null;
  },
});

/** Long stages must hold their lease open, or another worker will reclaim them mid-flight. */
export const renewLease = mutation({
  args: { projectId: v.id("projects"), workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { projectId, workerId, ttlSeconds }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.leaseWorkerId !== workerId) return; // lost the lease; stop
    await ctx.db.patch(projectId, { leaseExpiresAt: Date.now() + ttlSeconds * 1000 });
  },
});

async function finishStageRun(
  ctx: { db: any },
  project: Doc<"projects">,
  status: "succeeded" | "failed",
  error?: string,
) {
  const run = (
    await ctx.db
      .query("stageRuns")
      .withIndex("by_project", (q: any) => q.eq("projectId", project._id))
      .collect()
  )
    .filter((r: Doc<"stageRuns">) => r.status === "running")
    .pop();

  if (run) {
    await ctx.db.patch(run._id, { status, finishedAt: Date.now(), error });
  }
}

/**
 * Report the outcome of exactly one stage, and release the lease.
 *
 * The worker tells us WHICH stage to move to — it computed it with the same pure
 * `nextStage()` we would have. We do not re-derive it here; we just record it.
 */
export const commitResult = mutation({
  args: {
    projectId: v.id("projects"),
    workerId: v.string(),
    result: v.union(
      v.object({ kind: v.literal("advance"), next: stageValidator }),
      v.object({
        kind: v.literal("manualTasks"),
        tasks: v.array(
          v.object({
            title: v.string(),
            description: v.string(),
            wixDashboardUrl: v.optional(v.string()),
            blocking: v.boolean(),
          }),
        ),
      }),
      v.object({ kind: v.literal("failed"), error: v.string() }),
    ),
  },
  handler: async (ctx, { projectId, workerId, result }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");

    // We lost the lease while working (we were too slow, someone reclaimed us).
    // Drop the result on the floor rather than corrupting state — the stage is
    // deterministic from its inputs, so whoever holds the lease will redo it safely.
    if (project.leaseWorkerId !== workerId) return;

    const releaseLease = { leaseWorkerId: undefined, leaseExpiresAt: undefined };

    if (result.kind === "advance") {
      await finishStageRun(ctx, project, "succeeded");
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        attempts: 0,
        lastError: undefined,
        status: result.next === "Completed" ? "completed" : "active",
      });
      return;
    }

    if (result.kind === "manualTasks") {
      await finishStageRun(ctx, project, "succeeded");
      for (const task of result.tasks) {
        await ctx.db.insert("manualTasks", {
          projectId,
          stage: project.currentStage,
          ...task,
          completed: false,
        });
      }
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: "WaitingForManualActions",
        attempts: 0,
      });
      return;
    }

    // failed — park the lease, bump attempts. Retry/backoff policy is Phase 6;
    // for now the stage simply becomes leasable again and will be retried.
    await finishStageRun(ctx, project, "failed", result.error);
    await ctx.db.patch(projectId, {
      ...releaseLease,
      attempts: project.attempts + 1,
      lastError: result.error,
    });
  },
});

/** Structured logs. Separate table by design: appending here never contends with
 *  the dashboard reading `projects` (the Convex OCC guardrail). */
export const appendLog = mutation({
  args: {
    projectId: v.id("projects"),
    stage: stageValidator,
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", args);
  },
});

export const appendArtifact = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(
      v.literal("brief"),
      v.literal("specification"),
      v.literal("design"),
      v.literal("buildReport"),
      v.literal("preview"),
      v.literal("releaseReport"),
    ),
    data: v.any(),
    promptHash: v.string(),
    inputsHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Append-only: the new version is always max(existing) + 1. We never overwrite.
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_type", (q) =>
        q.eq("projectId", args.projectId).eq("type", args.type),
      )
      .collect();

    const version = existing.length + 1;
    const artifactId = await ctx.db.insert("artifacts", { ...args, version });

    // Anything a human must sign off on gets a review row waiting for them.
    const REVIEWABLE = ["specification", "design", "preview"];
    if (REVIEWABLE.includes(args.type)) {
      await ctx.db.insert("reviews", {
        projectId: args.projectId,
        artifactId,
        artifactType: args.type,
        version,
        status: "waiting",
        comments: [],
      });
    }

    return { id: artifactId, version };
  },
});

/** Claim the next queued change request — how a Completed project comes back to life. */
export const claimChangeRequest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const next = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", projectId).eq("status", "queued"),
      )
      .first();

    if (!next) return null;
    await ctx.db.patch(next._id, { status: "running" });
    return { id: next._id, description: next.description };
  },
});

export const completeChangeRequest = mutation({
  args: {
    changeRequestId: v.id("changeRequests"),
    status: v.union(v.literal("done"), v.literal("failed")),
  },
  handler: async (ctx, { changeRequestId, status }) => {
    await ctx.db.patch(changeRequestId, { status });
  },
});

export const hasBlockingIncompleteTasks = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const tasks = await ctx.db
      .query("manualTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return tasks.some((t) => t.blocking && !t.completed);
  },
});

export type { Stage };
export { nextStage };
