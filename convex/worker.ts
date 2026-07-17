/**
 * The queue. Everything the background worker needs, and nothing else.
 *
 * These functions are deliberately MECHANICAL: claim a project, record what happened,
 * release it. There is no business logic here beyond the pure `nextStage()` from
 * @factory/shared. That constraint is what keeps a future Postgres port a mechanical
 * translation rather than a rewrite — see the portability guardrails in CLAUDE.md.
 */

import { v } from "convex/values";
import {
  isRunnableStage,
  nextStage,
  normalizeReviewFeedback,
  STAGES,
  type Stage,
} from "@factory/shared";
import { mutation } from "./_generated/server";
import { artifactTypeValidator, stageValidator } from "./schema";
import type { Doc } from "./_generated/dataModel";

const designScreenProgressValidator = v.object({
  pageTitle: v.string(),
  pagePath: v.string(),
  status: v.union(v.literal("queued"), v.literal("generating"), v.literal("ready")),
  screenshotStorageId: v.optional(v.id("_storage")),
});

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
          p.attempts < 3 &&
          (p.leaseWorkerId === undefined || (p.leaseExpiresAt ?? 0) < now), // stale lease or restarted local worker → reclaim
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
        planningCycle: project.planningCycle ?? 1,
        wix: project.wix,
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
        kind: v.literal("wixProvisioned"),
        next: stageValidator,
        wix: v.object({
          projectId: v.optional(v.string()),
          siteId: v.string(),
          appId: v.string(),
        }),
        github: v.object({
          owner: v.string(),
          name: v.string(),
          cloneUrl: v.string(),
          htmlUrl: v.string(),
          defaultBranch: v.string(),
        }),
      }),
      v.object({
        kind: v.literal("codeGenerated"),
        next: stageValidator,
        github: v.object({
          owner: v.string(),
          name: v.string(),
          cloneUrl: v.string(),
          htmlUrl: v.string(),
          defaultBranch: v.string(),
        }),
      }),
      v.object({
        kind: v.literal("websiteQaCompleted"),
        next: stageValidator,
        previewArtifactId: v.id("artifacts"),
        previewVersion: v.number(),
        previewUrl: v.string(),
      }),
      v.object({
        kind: v.literal("manualTasks"),
        checklistKey: v.string(),
        tasks: v.array(
          v.object({
            taskKey: v.string(),
            title: v.string(),
            description: v.string(),
            wixDashboardUrl: v.optional(v.string()),
            blocking: v.boolean(),
            configuration: v.optional(
              v.object({
                key: v.string(),
                label: v.string(),
                placeholder: v.optional(v.string()),
                instructions: v.array(v.string()),
                expectedFields: v.optional(
                  v.array(v.object({ name: v.string(), description: v.string() })),
                ),
              }),
            ),
          }),
        ),
      }),
      v.object({ kind: v.literal("failed"), error: v.string(), retryable: v.boolean() }),
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

    if (result.kind === "wixProvisioned") {
      await finishStageRun(ctx, project, "succeeded");
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        attempts: 0,
        lastError: undefined,
        wix: { ...project.wix, ...result.wix },
        github: result.github,
      });
      return;
    }

    if (result.kind === "codeGenerated") {
      await finishStageRun(ctx, project, "succeeded");
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        attempts: 0,
        lastError: undefined,
        github: result.github,
      });
      return;
    }

    if (result.kind === "websiteQaCompleted") {
      await finishStageRun(ctx, project, "succeeded");
      await ctx.db.insert("reviews", {
        projectId,
        artifactId: result.previewArtifactId,
        artifactType: "preview",
        version: result.previewVersion,
        status: "waiting",
        comments: [],
      });
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        attempts: 0,
        lastError: undefined,
        wix: { ...project.wix, previewUrl: result.previewUrl },
      });
      return;
    }

    if (result.kind === "manualTasks") {
      await finishStageRun(ctx, project, "succeeded");
      const existingTasks = await ctx.db
        .query("manualTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      for (const existing of existingTasks) {
        if (existing.active !== false && existing.checklistKey !== result.checklistKey) {
          await ctx.db.patch(existing._id, { active: false });
        }
      }
      for (const task of result.tasks) {
        if (
          existingTasks.some(
            (existing) =>
              existing.active !== false &&
              existing.checklistKey === result.checklistKey &&
              existing.taskKey === task.taskKey,
          )
        ) {
          continue;
        }
        await ctx.db.insert("manualTasks", {
          projectId,
          stage: project.currentStage,
          checklistKey: result.checklistKey,
          taskKey: task.taskKey,
          active: true,
          title: task.title,
          description: task.description,
          wixDashboardUrl: task.wixDashboardUrl,
          blocking: task.blocking,
          completed: false,
          configurationKey: task.configuration?.key,
          configurationLabel: task.configuration?.label,
          configurationPlaceholder: task.configuration?.placeholder,
          instructions: task.configuration?.instructions,
          expectedFields: task.configuration?.expectedFields,
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
      attempts: result.retryable ? project.attempts + 1 : 3,
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
    type: artifactTypeValidator,
    data: v.any(),
    promptHash: v.string(),
    inputsHash: v.string(),
    planningCycle: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Append-only: the new version is always max(existing) + 1. We never overwrite.
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_type", (q) => q.eq("projectId", args.projectId).eq("type", args.type))
      .collect();

    const version = existing.length + 1;
    const artifactId = await ctx.db.insert("artifacts", { ...args, version });

    // Anything a human must sign off on gets a review row waiting for them.
    const REVIEWABLE = ["specification", "design"];
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

export const getLatestArtifact = mutation({
  args: {
    projectId: v.id("projects"),
    type: artifactTypeValidator,
  },
  handler: async (ctx, { projectId, type }) => {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_project_type", (q) => q.eq("projectId", projectId).eq("type", type))
      .collect();
    const latest = artifacts.sort((a, b) => b.version - a.version)[0];
    return latest
      ? {
          id: latest._id,
          type: latest.type,
          version: latest.version,
          data: latest.data,
          planningCycle: latest.planningCycle,
        }
      : null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const getStorageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => await ctx.storage.getUrl(storageId),
});

export const getLatestApproved = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("specification"), v.literal("design"), v.literal("preview")),
  },
  handler: async (ctx, { projectId, type }) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const approved = reviews
      .filter((review) => review.artifactType === type && review.status === "approved")
      .sort((a, b) => b.version - a.version)[0];
    if (!approved) return null;
    const artifact = await ctx.db.get(approved.artifactId);
    return artifact
      ? {
          id: artifact._id,
          type: artifact.type,
          version: artifact.version,
          data: artifact.data,
          planningCycle: artifact.planningCycle,
        }
      : null;
  },
});

export const getLatestReviewFeedback = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("specification"), v.literal("design"), v.literal("preview")),
  },
  handler: async (ctx, { projectId, type }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return [];
    const planningCycle = project.planningCycle ?? 1;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const artifacts = await Promise.all(reviews.map((review) => ctx.db.get(review.artifactId)));
    const currentReviewIds = new Set(
      artifacts
        .filter((artifact) => artifact && (artifact.planningCycle ?? 1) === planningCycle)
        .map((artifact) => artifact!._id),
    );
    const currentReviews = reviews.filter((review) => currentReviewIds.has(review.artifactId));
    const latestApprovedVersion = Math.max(
      0,
      ...currentReviews
        .filter((review) => review.artifactType === type && review.status === "approved")
        .map((review) => review.version),
    );
    const latest = currentReviews
      .filter(
        (review) =>
          review.artifactType === type &&
          review.status === "needs_changes" &&
          review.version > latestApprovedVersion,
      )
      .sort((a, b) => b._creationTime - a._creationTime)[0];
    return normalizeReviewFeedback(latest?.comments ?? []);
  },
});

export const getLatestReviewContext = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("specification"), v.literal("design"), v.literal("preview")),
  },
  handler: async (ctx, { projectId, type }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const planningCycle = project.planningCycle ?? 1;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const artifacts = await Promise.all(reviews.map((review) => ctx.db.get(review.artifactId)));
    const currentReviewIds = new Set(
      artifacts
        .filter((artifact) => artifact && (artifact.planningCycle ?? 1) === planningCycle)
        .map((artifact) => artifact!._id),
    );
    const currentReviews = reviews.filter((review) => currentReviewIds.has(review.artifactId));
    const latestApprovedVersion = Math.max(
      0,
      ...currentReviews
        .filter((review) => review.artifactType === type && review.status === "approved")
        .map((review) => review.version),
    );
    const review = currentReviews
      .filter(
        (item) =>
          item.artifactType === type &&
          item.status === "needs_changes" &&
          item.version > latestApprovedVersion,
      )
      .sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!review) return null;
    const artifact = await ctx.db.get(review.artifactId);
    if (!artifact) return null;
    return {
      feedback: normalizeReviewFeedback(review.comments),
      artifact: {
        id: artifact._id,
        type: artifact.type,
        version: artifact.version,
        data: artifact.data,
        planningCycle: artifact.planningCycle,
      },
    };
  },
});

export const consumeLatestReviewFeedback = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("specification"), v.literal("design"), v.literal("preview")),
  },
  handler: async (ctx, { projectId, type }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return;
    const planningCycle = project.planningCycle ?? 1;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const reviewsWithArtifacts = await Promise.all(
      reviews.map(async (review) => ({ review, artifact: await ctx.db.get(review.artifactId) })),
    );
    const review = reviewsWithArtifacts
      .filter(
        ({ review, artifact }) =>
          review.artifactType === type &&
          review.status === "needs_changes" &&
          artifact &&
          (artifact.planningCycle ?? 1) === planningCycle,
      )
      .map(({ review }) => review)
      .filter((item) => item.artifactType === type && item.status === "needs_changes")
      .sort((a, b) => b._creationTime - a._creationTime)[0];
    if (review) await ctx.db.patch(review._id, { status: "rejected" });
  },
});

/**
 * Begin (or redo, after a crash) a design run: replace the project's progress rows
 * with the plan. Screens carried over from a previous design arrive already `ready`.
 */
export const resetDesignProgress = mutation({
  args: {
    projectId: v.id("projects"),
    screens: v.array(designScreenProgressValidator),
  },
  handler: async (ctx, { projectId, screens }) => {
    const existing = await ctx.db
      .query("designProgress")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const [order, screen] of screens.entries()) {
      await ctx.db.insert("designProgress", { projectId, order, ...screen });
    }
  },
});

/** Move one screen through queued → generating → ready. Upserts, keyed by page path. */
export const updateDesignProgress = mutation({
  args: {
    projectId: v.id("projects"),
    screen: designScreenProgressValidator,
  },
  handler: async (ctx, { projectId, screen }) => {
    const rows = await ctx.db
      .query("designProgress")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const existing = rows.find((row) => row.pagePath === screen.pagePath);
    if (existing) {
      await ctx.db.patch(existing._id, screen);
    } else {
      await ctx.db.insert("designProgress", { projectId, order: rows.length, ...screen });
    }
  },
});

/** Claim the next queued change request — how a Completed project comes back to life. */
export const claimChangeRequest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const running = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) => q.eq("projectId", projectId).eq("status", "running"))
      .first();
    if (running) return { id: running._id, description: running.description };

    const next = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) => q.eq("projectId", projectId).eq("status", "queued"))
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
    return tasks.some((t) => t.active !== false && t.blocking && !t.completed);
  },
});

export const activateManualTaskChecklist = mutation({
  args: { projectId: v.id("projects"), checklistKey: v.string() },
  handler: async (ctx, { projectId, checklistKey }) => {
    const tasks = await ctx.db
      .query("manualTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const task of tasks) {
      if (task.active !== false && task.checklistKey !== checklistKey) {
        await ctx.db.patch(task._id, { active: false });
      }
    }
  },
});

export const getManualTaskStatuses = mutation({
  args: { projectId: v.id("projects"), checklistKey: v.string() },
  handler: async (ctx, { projectId, checklistKey }) => {
    const tasks = await ctx.db
      .query("manualTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return tasks
      .filter((task) => task.active !== false && task.checklistKey === checklistKey)
      .map(({ taskKey, completed, configurationKey, configurationValue }) => ({
        taskKey: taskKey ?? "",
        completed,
        configurationKey,
        configurationValue,
      }));
  },
});

export type { Stage };
export { nextStage };
