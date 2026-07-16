/**
 * Dashboard-facing project functions.
 *
 * V1 has no auth: a single hardcoded owner. The `owner` field exists from day one so
 * multi-user is a swap, not a refactor.
 */

import { v } from "convex/values";
import { isRunnableStage, nextStage } from "@factory/shared";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const SINGLE_USER = "owner";

export const create = mutation({
  args: {
    title: v.string(),
    brief: v.string(),
    mode: v.optional(v.union(v.literal("simple"), v.literal("developer"))),
  },
  handler: async (ctx, { title, brief, mode }) => {
    const projectId = await ctx.db.insert("projects", {
      title,
      owner: SINGLE_USER,
      status: "active",
      currentStage: "Draft",
      brief,
      settings: {
        mode: mode ?? "simple",
        publishTarget: "wix-managed",
      },
      attempts: 0,
    });

    // The brief is itself an artifact — the first durable input. Everything
    // downstream is derived from it.
    await ctx.db.insert("artifacts", {
      projectId,
      type: "brief",
      version: 1,
      data: { brief },
      promptHash: "",
      inputsHash: "",
    });

    await ctx.db.insert("logs", {
      projectId,
      stage: "Draft",
      level: "info",
      message: "Project created",
    });

    return projectId;
  },
});

/**
 * Leave Draft. This is the only thing that starts the machine — after this, the
 * worker takes over and the project advances on its own until it needs a human.
 */
export const start = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (project.currentStage !== "Draft") return;

    await ctx.db.patch(projectId, {
      currentStage: nextStage("Draft", project.settings.mode),
      status: "active",
    });
  },
});

export const submitAnswers = mutation({
  args: {
    projectId: v.id("projects"),
    answers: v.array(v.object({ questionId: v.string(), value: v.string() })),
  },
  handler: async (ctx, { projectId, answers }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (project.currentStage !== "WaitingForAnswers") return;
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_type", (q) => q.eq("projectId", projectId).eq("type", "answers"))
      .collect();
    await ctx.db.insert("artifacts", {
      projectId,
      type: "answers",
      version: existing.length + 1,
      data: { answers },
      promptHash: "",
      inputsHash: "",
    });
    await ctx.db.insert("logs", {
      projectId,
      stage: "WaitingForAnswers",
      level: "info",
      message: "Questions answered",
    });
    await ctx.db.patch(projectId, { currentStage: "GeneratingSpecification", attempts: 0 });
  },
});

const returnPhaseValidator = v.union(
  v.literal("sitePlan"),
  v.literal("visualDesign"),
  v.literal("wixSetup"),
  v.literal("siteBuild"),
  v.literal("finalReview"),
  v.literal("publishing"),
);

/**
 * Return to an earlier lifecycle phase without deleting derived work. Review phases
 * reopen the latest saved version; work phases restart at their entry stage. Any
 * in-flight lease is revoked so a late worker result cannot advance the project.
 */
export const returnToPhase = mutation({
  args: { projectId: v.id("projects"), phase: returnPhaseValidator },
  handler: async (ctx, { projectId, phase }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");

    const targets = {
      sitePlan: {
        label: "site plan",
        stage: "WaitingForSpecificationApproval" as const,
        artifactType: "specification" as const,
      },
      visualDesign: {
        label: "visual design",
        stage: "WaitingForDesignApproval" as const,
        artifactType: "design" as const,
      },
      wixSetup: { label: "Wix setup", stage: "ProvisioningWix" as const },
      siteBuild: { label: "site build", stage: "GeneratingCode" as const },
      finalReview: {
        label: "final review",
        stage: "WaitingForFinalApproval" as const,
        artifactType: "preview" as const,
      },
      publishing: { label: "publishing", stage: "Publishing" as const },
    };
    const target = targets[phase];

    const waitingReviews = (
      await ctx.db
        .query("reviews")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((review) => review.status === "waiting");
    for (const review of waitingReviews) {
      await ctx.db.patch(review._id, {
        status: "rejected",
        comments: [...review.comments, { comment: `Closed after returning to ${target.label}` }],
      });
    }

    if ("artifactType" in target) {
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_project_type", (q) =>
          q.eq("projectId", projectId).eq("type", target.artifactType),
        )
        .collect();
      const artifact = artifacts.sort((a, b) => b.version - a.version)[0];
      if (!artifact) throw new Error(`No saved ${target.label} is available`);
      await ctx.db.insert("reviews", {
        projectId,
        artifactId: artifact._id,
        artifactType: target.artifactType,
        version: artifact.version,
        status: "waiting",
        comments: [],
      });
    }

    const runningStageRuns = (
      await ctx.db
        .query("stageRuns")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((run) => run.status === "running");
    for (const run of runningStageRuns) {
      await ctx.db.patch(run._id, {
        status: "failed",
        finishedAt: Date.now(),
        error: `Stopped after returning to ${target.label}`,
      });
    }

    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: `Returned to ${target.label}`,
    });
    await ctx.db.patch(projectId, {
      currentStage: target.stage,
      status: "active",
      attempts: 0,
      lastError: undefined,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
    });
  },
});

export const retryCurrentStage = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isRunnableStage(project.currentStage) || project.attempts < 3) return;
    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "Retry requested",
    });
    await ctx.db.patch(projectId, {
      attempts: 0,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      status: "active",
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("owner", SINGLE_USER))
      .order("desc")
      .collect(),
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => await ctx.db.get(projectId),
});

/**
 * Everything the project page needs, in one live-updating query.
 *
 * This is the payoff for choosing Convex: the user watches their site get built and
 * the page just... updates. No polling, no SSE plumbing, no subscription code.
 */
export const detail = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;

    const [artifacts, reviews, manualTasks, logs, changeRequests, designProgress] =
      await Promise.all([
      ctx.db
        .query("artifacts")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("reviews")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("manualTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(100),
      ctx.db
        .query("changeRequests")
        .withIndex("by_project_status", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("designProgress")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);

    const artifactStorageIds = artifacts.flatMap((artifact) => {
      if (artifact.type !== "design") return [];
      const screens =
        (
          artifact.data as {
            screens?: Array<{ htmlStorageId?: string; screenshotStorageId?: string }>;
          }
        ).screens ?? [];
      return screens.flatMap(
        (screen) => [screen.htmlStorageId, screen.screenshotStorageId].filter(Boolean) as string[],
      );
    });
    const storageIds = [...new Set(artifactStorageIds)];
    const assetUrls = Object.fromEntries(
      await Promise.all(
        storageIds.map(async (storageId) => [
          storageId,
          await ctx.storage.getUrl(storageId as Id<"_storage">),
        ]),
      ),
    );

    return {
      project,
      artifacts,
      reviews,
      manualTasks,
      logs,
      changeRequests,
      assetUrls,
      // Live per-screen design progress, ready to render — screenshot URLs resolved.
      designProgress: await Promise.all(
        designProgress
          .sort((a, b) => a.order - b.order)
          .map(async (row) => ({
            pageTitle: row.pageTitle,
            pagePath: row.pagePath,
            status: row.status,
            screenshotUrl: row.screenshotStorageId
              ? await ctx.storage.getUrl(row.screenshotStorageId)
              : null,
          })),
      ),
      // The gate the user is currently sitting at, if any.
      pendingReview: reviews.find((r) => r.status === "waiting") ?? null,
    };
  },
});
