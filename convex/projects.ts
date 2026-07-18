/** Dashboard-facing project CRUD and minimal waiting-gate controls. */
import {Artifact, isRunnableStage, isWaitingStage, nextStage} from "@factory/shared";
import {v} from "convex/values";
import {mutation, MutationCtx, query} from "./_generated/server";
import {api, internal} from "./_generated/api";
import {Doc, Id} from "./_generated/dataModel";
import {resolveArtifact} from "./utils";

const SINGLE_USER = "owner";

export const create = mutation({
  args: { title: v.string(), brief: v.string() },
  handler: async (ctx, { title, brief }) => {
    const projectId = await ctx.db.insert("projects", {
      title,
      owner: SINGLE_USER,
      status: "active",
      planningCycle: 0,
      currentStage: 'Draft',
      settings: { mode: "simple", publishTarget: "wix-managed" },
    });

    await ctx.runMutation(api.worker.addArtifact, {
      projectId,
      type: 'brief',
      data: brief
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
      currentStage: nextStage("Draft"),
      status: "active"
    });
  },
});

/**
 * Minimal stand-in for future review forms and manual actions. Waiting stages remain
 * non-runnable; the user explicitly advances them and the worker picks up the result.
 */
export const continueFromGate = mutation({
  args: { projectId: v.id("projects"), stageData: v.optional(v.any()) },
  handler: async (ctx, { projectId, stageData }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isWaitingStage(project.currentStage) || project.currentStage === "Completed") return;
    if (stageData) {
      await submitStage(ctx, project, stageData);
    }

    const next = nextStage(project.currentStage);
    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "User continued the project",
    });
    await ctx.db.patch(projectId, {
      currentStage: next,
      status: "active",
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
    });
  },
});

async function submitStage(ctx: MutationCtx, project: Doc<'projects'>, data: any): Promise<void> {
  switch (project.currentStage) {
    case "WaitingForAnswers":
      const questions = await ctx.runQuery(api.worker.getLatestArtifact, {projectId: project._id, type: 'questions'});
      if (!questions) return;
      await ctx.db.patch('artifacts', questions.id as Id<'artifacts'>, {
        data
      });
  }
}

export const retryCurrentStage = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isRunnableStage(project.currentStage)) return;

    await ctx.db.patch(projectId, {
      status: "active",
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined
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

    const artifacts = await ctx.db.query('artifacts')
      .withIndex('by_project', q => q.eq('projectId', projectId))
      .collect();

    const resolvedArtifacts: Artifact[] = await Promise.all(
      artifacts.map(a => resolveArtifact(ctx, a))
    );

    return {
      project,
      logs,
      artifacts: resolvedArtifacts
    };
  },
});
