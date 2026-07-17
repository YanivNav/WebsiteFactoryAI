/** Dashboard-facing project CRUD and minimal waiting-gate controls. */
import { isRunnableStage, isWaitingStage, nextStage } from "@factory/shared";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SINGLE_USER = "owner";

export const create = mutation({
  args: { title: v.string(), brief: v.string() },
  handler: async (ctx, { title, brief }) => {
    const projectId = await ctx.db.insert("projects", {
      title,
      owner: SINGLE_USER,
      status: "active",
      currentStage: "Draft",
      brief,
      settings: { mode: "simple", publishTarget: "wix-managed" },
      attempts: 0,
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

export const start = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (project.currentStage !== "Draft") return;

    await ctx.db.patch(projectId, {
      currentStage: nextStage("Draft", project.settings.mode),
      status: "active",
      attempts: 0,
      lastError: undefined,
    });
  },
});

/**
 * Minimal stand-in for future review forms and manual actions. Waiting stages remain
 * non-runnable; the user explicitly advances them and the worker picks up the result.
 */
export const continueFromGate = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isWaitingStage(project.currentStage) || project.currentStage === "Completed") return;

    const next = nextStage(project.currentStage, project.settings.mode);
    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "User continued the project",
    });
    await ctx.db.patch(projectId, {
      currentStage: next,
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
    if (!isRunnableStage(project.currentStage)) return;

    await ctx.db.patch(projectId, {
      status: "active",
      attempts: 0,
      lastError: undefined,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
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

export const detail = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(20);
    return { project, logs };
  },
});
