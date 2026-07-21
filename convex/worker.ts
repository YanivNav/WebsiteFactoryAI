import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  artifactTypeValidator,
  phaseValidator,
  userTaskResultValidator,
  workInstructionValidator,
} from "./schema";
import { insertArtifact, insertWork, resolveArtifact } from "./utils";

const workDraftValidator = v.object({
  phase: phaseValidator,
  label: v.string(),
  instruction: workInstructionValidator,
});

const workCompletionValidator = v.union(
  v.object({ type: v.literal("completeProject") }),
  v.object({ type: v.literal("startWork"), work: workDraftValidator }),
  v.object({
    type: v.literal("createUserTask"),
    task: v.object({
      phase: phaseValidator,
      label: v.string(),
      subjectArtifactId: v.id("artifacts"),
      previousResultArtifactId: v.optional(v.id("artifacts")),
      result: userTaskResultValidator,
    }),
  }),
);

export const leaseNextWork = mutation({
  args: { workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { workerId, ttlSeconds }) => {
    const now = Date.now();
    const queued = await ctx.db
      .query("works")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    const running = await ctx.db
      .query("works")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    const candidates = [...queued, ...running.filter((work) => (work.leaseExpiresAt ?? 0) < now)];

    for (const work of candidates) {
      const project = await ctx.db.get(work.projectId);
      if (
        !project ||
        project.currentActivity.type !== "work" ||
        project.currentActivity.workId !== work._id
      ) {
        await ctx.db.patch(work._id, {
          status: "cancelled",
          leaseWorkerId: undefined,
          leaseExpiresAt: undefined,
        });
        continue;
      }

      await ctx.db.patch(work._id, {
        status: "running",
        leaseWorkerId: workerId,
        leaseExpiresAt: now + ttlSeconds * 1000,
        startedAt: now,
        error: undefined,
      });
      return {
        id: work._id,
        projectId: project._id,
        projectTitle: project.title,
        phase: work.phase,
        label: work.label,
        instruction: work.instruction,
        attempt: work.attempt,
        settings: project.settings,
      };
    }
    return null;
  },
});

export const renewLease = mutation({
  args: { workId: v.id("works"), workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { workId, workerId, ttlSeconds }) => {
    const work = await ctx.db.get(workId);
    if (work?.status !== "running" || work.leaseWorkerId !== workerId) return;
    await ctx.db.patch(workId, { leaseExpiresAt: Date.now() + ttlSeconds * 1000 });
  },
});

export const appendLog = mutation({
  args: {
    projectId: v.id("projects"),
    workId: v.id("works"),
    attempt: v.number(),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, input) => {
    await ctx.db.insert("logs", input);
  },
});

export const appendProgress = mutation({
  args: {
    projectId: v.id("projects"),
    workId: v.id("works"),
    workerId: v.string(),
    attempt: v.number(),
    percent: v.number(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { workerId, ...input }) => {
    const work = await ctx.db.get(input.workId);
    if (
      !work ||
      work.status !== "running" ||
      work.leaseWorkerId !== workerId ||
      work.attempt !== input.attempt
    ) {
      return;
    }
    await ctx.db.insert("workProgress", {
      ...input,
      percent: Math.min(100, Math.max(0, input.percent)),
    });
  },
});

export const generateUploadUrl = mutation({
  args: { workId: v.id("works"), workerId: v.string() },
  handler: async (ctx, { workId, workerId }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.status !== "running" || work.leaseWorkerId !== workerId) {
      throw new Error("Work no longer owns this upload");
    }
    return ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return ctx.storage.getUrl(storageId);
  },
});

export const claimScreenRevisions = mutation({
  args: { workId: v.id("works"), workerId: v.string() },
  handler: async (ctx, { workId, workerId }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.status !== "running" || work.leaseWorkerId !== workerId) return [];
    const pending = await ctx.db
      .query("screenRevisions")
      .withIndex("by_work_and_status", (q) => q.eq("workId", workId).eq("status", "pending"))
      .collect();
    await Promise.all(pending.map((row) => ctx.db.patch(row._id, { status: "claimed" })));
    return pending.map((row) => ({ screenPath: row.screenPath, feedback: row.feedback }));
  },
});

export const getArtifact = query({
  args: { projectId: v.id("projects"), artifactId: v.id("artifacts") },
  handler: async (ctx, { projectId, artifactId }) => {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact || artifact.projectId !== projectId) return null;
    return resolveArtifact(ctx, artifact);
  },
});

export const addArtifact = mutation({
  args: {
    projectId: v.id("projects"),
    workId: v.id("works"),
    workerId: v.string(),
    outputKey: v.string(),
    type: artifactTypeValidator,
    data: v.any(),
    basedOnArtifactId: v.optional(v.id("artifacts")),
    assets: v.optional(
      v.array(v.object({ id: v.string(), data: v.any(), storageId: v.id("_storage") })),
    ),
  },
  handler: async (ctx, input) => {
    const work = await ctx.db.get(input.workId);
    if (
      !work ||
      work.projectId !== input.projectId ||
      work.status !== "running" ||
      work.leaseWorkerId !== input.workerId
    ) {
      throw new Error("Work no longer owns this artifact output");
    }
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_work_and_output", (q) =>
        q.eq("createdByWorkId", input.workId).eq("outputKey", input.outputKey),
      )
      .first();
    if (existing) {
      if (existing.type !== input.type) {
        throw new Error("Work output key was reused for another artifact type");
      }
      return resolveArtifact(ctx, existing);
    }

    const artifactId = await insertArtifact(ctx, {
      projectId: input.projectId,
      type: input.type,
      data: input.data,
      basedOnArtifactId: input.basedOnArtifactId,
      createdByWorkId: input.workId,
      outputKey: input.outputKey,
      assets: input.assets,
    });
    const artifact = await ctx.db.get(artifactId);
    if (!artifact) throw new Error("Artifact could not be saved");
    return resolveArtifact(ctx, artifact);
  },
});

export const completeWork = mutation({
  args: {
    workId: v.id("works"),
    workerId: v.string(),
    completion: workCompletionValidator,
  },
  handler: async (ctx, { workId, workerId, completion }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.status !== "running" || work.leaseWorkerId !== workerId) return;
    const project = await ctx.db.get(work.projectId);
    if (
      !project ||
      project.currentActivity.type !== "work" ||
      project.currentActivity.workId !== workId
    ) {
      return;
    }
    const outputArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_work", (q) => q.eq("createdByWorkId", workId))
      .collect();

    await ctx.db.patch(workId, {
      status: "completed",
      outputArtifactIds: outputArtifacts.map((artifact) => artifact._id),
      completedAt: Date.now(),
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      error: undefined,
    });

    // Screen revisions that arrived after the worker's final drain would
    // otherwise be dropped. Roll the first one into a follow-up revision work
    // based on the artifact just produced (instead of opening the review task)
    // and re-parent the rest onto it, so its own drain picks them up.
    if (work.instruction.type === "generateDesign") {
      const pending = await ctx.db
        .query("screenRevisions")
        .withIndex("by_work_and_status", (q) => q.eq("workId", workId).eq("status", "pending"))
        .collect();
      const baseArtifact = outputArtifacts.find((artifact) => artifact.type === "design");
      if (pending.length > 0 && baseArtifact) {
        const [first, ...rest] = pending;
        const followUpId = await insertWork(
          ctx,
          project._id,
          {
            phase: work.phase,
            label: work.label,
            instruction: {
              ...work.instruction,
              revision: {
                mode: "revise",
                baseArtifactId: baseArtifact._id,
                feedback: first!.feedback,
                screenPath: first!.screenPath,
              },
            },
          },
          "queued",
        );
        await ctx.db.delete(first!._id);
        for (const row of rest) await ctx.db.patch(row._id, { workId: followUpId });
        await ctx.db.patch(project._id, {
          currentActivity: { type: "work", workId: followUpId },
        });
        return;
      }
    }

    if (completion.type === "completeProject") {
      await ctx.db.patch(project._id, { currentActivity: { type: "completed" } });
      return;
    }
    if (completion.type === "startWork") {
      const nextWorkId = await insertWork(ctx, project._id, completion.work, "queued");
      await ctx.db.patch(project._id, {
        currentActivity: { type: "work", workId: nextWorkId },
      });
      return;
    }

    const taskId = await ctx.db.insert("userTasks", {
      projectId: project._id,
      ...completion.task,
      status: "open",
    });
    await ctx.db.patch(project._id, {
      currentActivity: { type: "userTask", userTaskId: taskId },
    });
  },
});

export const failWork = mutation({
  args: {
    workId: v.id("works"),
    workerId: v.string(),
    error: v.string(),
    technicalDetails: v.optional(v.string()),
  },
  handler: async (ctx, { workId, workerId, error, technicalDetails }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.status !== "running" || work.leaseWorkerId !== workerId) return;
    await ctx.db.patch(workId, {
      status: "failed",
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      error: {
        message: error,
        technicalDetails,
        retryable: true,
        occurredAt: Date.now(),
      },
    });
  },
});
