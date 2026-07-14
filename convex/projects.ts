/**
 * Dashboard-facing project functions.
 *
 * V1 has no auth: a single hardcoded owner. The `owner` field exists from day one so
 * multi-user is a swap, not a refactor.
 */

import { v } from "convex/values";
import { nextStage } from "@factory/shared";
import { mutation, query } from "./_generated/server";

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

    const [artifacts, reviews, manualTasks, logs, changeRequests] = await Promise.all([
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
    ]);

    return {
      project,
      artifacts,
      reviews,
      manualTasks,
      logs,
      changeRequests,
      // The gate the user is currently sitting at, if any.
      pendingReview: reviews.find((r) => r.status === "waiting") ?? null,
    };
  },
});
