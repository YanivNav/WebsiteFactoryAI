import { type Artifact, type ArtifactType } from "@factory/shared";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { insertArtifact, insertWork, resolveArtifact, validateInstructionContract } from "./utils";

const SINGLE_USER = "owner";

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const projectId = await ctx.db.insert("projects", {
      title,
      owner: SINGLE_USER,
      currentActivity: { type: "draft" },
      approvedArtifacts: {},
      settings: { mode: "simple", publishTarget: "wix-managed" },
    });
    await ctx.db.insert("logs", {
      projectId,
      level: "info",
      message: "Project created",
    });
    return projectId;
  },
});

export const start = mutation({
  args: { projectId: v.id("projects"), brief: v.string() },
  handler: async (ctx, { projectId, brief }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "draft") return;
    let briefId = project.approvedArtifacts.brief;
    const currentBrief = briefId ? await ctx.db.get(briefId) : undefined;
    const nextBrief = brief?.trim();
    if (nextBrief && currentBrief?.data !== nextBrief) {
      await ctx.db.delete(briefId);
      briefId = await insertArtifact(ctx, {
        projectId,
        type: "brief",
        data: nextBrief,
      });
      await ctx.db.patch(projectId, { approvedArtifacts: { brief: briefId } });
    }

    const workId = await insertWork(
      ctx,
      projectId,
      {
        phase: "sitePlan",
        label: "Reading your brief",
        instruction: {
          type: "generateQuestions",
          inputs: {
            brief: { source: "artifact", artifactType: "brief", artifactId: briefId },
          },
          revision: { mode: "initial" },
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

export const completeUserTask = mutation({
  args: {
    userTaskId: v.id("userTasks"),
    artifactId: v.optional(v.id("artifacts")),
    subjectArtifactId: v.optional(v.id("artifacts")),
    resultData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.userTaskId);
    if (!task || task.status !== "open") throw new Error("This task is no longer open");
    const project = await requireProject(ctx, task.projectId);
    if (
      project.currentActivity.type !== "userTask" ||
      project.currentActivity.userTaskId !== task._id
    ) {
      throw new Error("This is not the current task");
    }

    let resultArtifactId: Id<"artifacts"> | undefined;
    let chosenSubjectArtifactId: Id<"artifacts"> | undefined;

    if (task.result.type === "selectVersion") {
      if (!args.artifactId) throw new Error("Choose a version before continuing");
      const artifact = await requireTaskArtifact(ctx, task, args.artifactId);
      resultArtifactId = artifact._id;
      chosenSubjectArtifactId = artifact._id;
    } else if (task.result.type === "submitArtifact") {
      if (args.resultData === undefined) throw new Error("Task results are required");
      const subjectId = args.subjectArtifactId ?? task.subjectArtifactId;
      await requireTaskArtifact(ctx, task, subjectId);
      chosenSubjectArtifactId = subjectId;
      resultArtifactId = await insertArtifact(ctx, {
        projectId: task.projectId,
        type: task.result.artifactType,
        data: args.resultData,
        basedOnArtifactId: task.previousResultArtifactId,
        createdByUserTaskId: task._id,
      });
    }

    const now = Date.now();
    await ctx.db.patch(task._id, {
      status: "completed",
      completedAt: now,
      chosenSubjectArtifactId,
      resultArtifactId,
    });

    const approvedArtifacts = { ...project.approvedArtifacts };
    if (chosenSubjectArtifactId) {
      const selectedSubject = await ctx.db.get(chosenSubjectArtifactId);
      if (!selectedSubject) throw new Error("The selected version is unavailable");
      approvedArtifacts[selectedSubject.type] = chosenSubjectArtifactId;
    }
    if (resultArtifactId) {
      const resolved = await ctx.db.get(resultArtifactId);
      if (!resolved) throw new Error("Task result is unavailable");
      approvedArtifacts[resolved.type] = resultArtifactId;
    }

    if (task.onComplete.type === "completeProject") {
      await ctx.db.patch(project._id, {
        approvedArtifacts,
        currentActivity: { type: "completed" },
      });
      return;
    }

    if (!resultArtifactId) throw new Error("This task did not produce the required result");
    const nextWorkId = await insertWork(
      ctx,
      project._id,
      materializePendingWork(task.onComplete.work, resultArtifactId),
      "queued",
    );
    await ctx.db.patch(project._id, {
      approvedArtifacts,
      currentActivity: { type: "work", workId: nextWorkId },
    });
  },
});

export const reviseCurrentTask = mutation({
  args: {
    userTaskId: v.id("userTasks"),
    sourceArtifactId: v.id("artifacts"),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { userTaskId, sourceArtifactId, feedback }) => {
    const task = await ctx.db.get(userTaskId);
    if (!task || task.status !== "open") throw new Error("This task is no longer open");
    const project = await requireProject(ctx, task.projectId);
    if (
      project.currentActivity.type !== "userTask" ||
      project.currentActivity.userTaskId !== task._id
    ) {
      throw new Error("This is not the current task");
    }
    const source = await requireTaskArtifact(ctx, task, sourceArtifactId);
    if (!source.createdByWorkId) throw new Error("This artifact cannot be regenerated");
    const producingWork = await ctx.db.get(source.createdByWorkId);
    if (!producingWork || producingWork.projectId !== project._id) {
      throw new Error("The original work is unavailable");
    }

    await cancelTaskAndContinuation(ctx, task);
    const note = feedback?.trim();
    const workId = await insertWork(
      ctx,
      project._id,
      {
        phase: producingWork.phase,
        label: producingWork.label,
        instruction: {
          ...producingWork.instruction,
          revision: {
            mode: note ? "revise" : "regenerate",
            baseArtifactId: source._id,
            feedback: note || undefined,
          },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

export const revisitUserTask = mutation({
  args: {
    userTaskId: v.id("userTasks"),
    artifactId: v.optional(v.id("artifacts")),
  },
  handler: async (ctx, { userTaskId, artifactId }) => {
    const sourceTask = await ctx.db.get(userTaskId);
    if (!sourceTask || sourceTask.status !== "completed") {
      throw new Error("Only completed steps can be revisited");
    }
    const project = await requireProject(ctx, sourceTask.projectId);
    await cancelCurrentActivity(ctx, project);

    let subjectArtifactId = sourceTask.chosenSubjectArtifactId ?? sourceTask.subjectArtifactId;
    if (artifactId) {
      if (sourceTask.result.type !== "selectVersion") {
        throw new Error("This task does not select an artifact version");
      }
      const artifact = await requireTaskArtifact(ctx, sourceTask, artifactId);
      subjectArtifactId = artifact._id;
    }
    const newTaskId = await ctx.db.insert("userTasks", {
      projectId: project._id,
      phase: sourceTask.phase,
      label: sourceTask.label,
      subjectArtifactId,
      previousResultArtifactId: sourceTask.resultArtifactId,
      result: sourceTask.result,
      onComplete: sourceTask.onComplete,
      status: "open",
    });
    // The revisit supersedes the original completed step. Retire it so the timeline
    // shows a single active instance instead of a completed + current duplicate.
    await ctx.db.patch(sourceTask._id, { status: "cancelled" });
    await ctx.db.patch(project._id, {
      currentActivity: { type: "userTask", userTaskId: newTaskId },
    });
  },
});

export const retryCurrentWork = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "work") return;
    const work = await ctx.db.get(project.currentActivity.workId);
    if (!work || work.status !== "failed" || !work.error?.retryable) return;
    await ctx.db.patch(work._id, {
      status: "queued",
      attempt: work.attempt + 1,
      error: undefined,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      startedAt: undefined,
    });
  },
});

export const restartFromBrief = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    const briefId = project.approvedArtifacts.brief;
    if (!briefId || !(await ctx.db.get(briefId))) throw new Error("Project brief not found");

    const [works, tasks, artifacts, logs] = await Promise.all([
      ctx.db
        .query("works")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("userTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);

    for (const work of works) {
      const progress = await ctx.db
        .query("workProgress")
        .withIndex("by_work", (q) => q.eq("workId", work._id))
        .collect();
      for (const item of progress) await ctx.db.delete(item._id);
    }
    for (const item of logs) await ctx.db.delete(item._id);
    for (const item of tasks) await ctx.db.delete(item._id);
    for (const item of works) await ctx.db.delete(item._id);
    const deletedStorageIds = new Set<string>();
    for (const artifact of artifacts) {
      if (artifact._id === briefId) continue;
      for (const asset of artifact.assets) {
        if (deletedStorageIds.has(asset.storageId)) continue;
        await ctx.storage.delete(asset.storageId);
        deletedStorageIds.add(asset.storageId);
      }
      await ctx.db.delete(artifact._id);
    }

    await ctx.db.patch(projectId, {
      approvedArtifacts: { brief: briefId },
      currentActivity: { type: "draft" },
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("owner", SINGLE_USER))
      .order("desc")
      .collect();
    return Promise.all(
      projects.map(async (project) => ({
        project,
        activity: await resolveActivity(ctx, project),
      })),
    );
  },
});

export const detail = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [works, userTasks, artifacts, logs] = await Promise.all([
      ctx.db
        .query("works")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("userTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(30),
    ]);
    const activity = project.currentActivity;
    const currentWork =
      activity.type === "work" ? works.find((work) => work._id === activity.workId) : undefined;
    const currentUserTask =
      activity.type === "userTask"
        ? userTasks.find((task) => task._id === activity.userTaskId)
        : undefined;
    const progress = currentWork
      ? await ctx.db
          .query("workProgress")
          .withIndex("by_work_and_attempt", (q) =>
            q.eq("workId", currentWork._id).eq("attempt", currentWork.attempt),
          )
          .order("desc")
          .first()
      : null;
    const resolvedArtifacts: Artifact[] = await Promise.all(
      artifacts.map((artifact) => resolveArtifact(ctx, artifact)),
    );

    return {
      project,
      currentWork,
      currentUserTask,
      works,
      userTasks,
      progress,
      logs,
      artifacts: resolvedArtifacts,
    };
  },
});

async function requireProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

async function requireTaskArtifact(
  ctx: MutationCtx,
  task: Doc<"userTasks">,
  artifactId: Id<"artifacts">,
) {
  const artifact = await ctx.db.get(artifactId);
  if (!artifact || artifact.projectId !== task.projectId) throw new Error("Version not found");
  const subject = await ctx.db.get(task.subjectArtifactId);
  if (!subject || artifact.type !== subject.type) {
    throw new Error("That version cannot be used for this task");
  }
  return artifact;
}

function materializePendingWork(
  pendingWork: Extract<Doc<"userTasks">["onComplete"], { type: "startWork" }>["work"],
  resultArtifactId: Id<"artifacts">,
) {
  validateInstructionContract(pendingWork.instruction, "continuation");
  const inputs: Record<
    string,
    {
      source: "artifact";
      artifactType: ArtifactType;
      artifactId: Id<"artifacts">;
    }
  > = {};
  for (const [name, input] of Object.entries(pendingWork.instruction.inputs)) {
    inputs[name] =
      input.source === "userTaskResult"
        ? {
            source: "artifact",
            artifactType: input.artifactType,
            artifactId: resultArtifactId,
          }
        : input;
  }

  return {
    phase: pendingWork.phase,
    label: pendingWork.label,
    instruction: {
      ...pendingWork.instruction,
      inputs,
    },
  };
}

async function cancelCurrentActivity(ctx: MutationCtx, project: Doc<"projects">) {
  if (project.currentActivity.type === "work") {
    const work = await ctx.db.get(project.currentActivity.workId);
    if (work?.status === "running") throw new Error("Wait for the current work to finish first");
    if (work && !["completed", "cancelled"].includes(work.status)) {
      await ctx.db.patch(work._id, { status: "cancelled" });
    }
  }
  if (project.currentActivity.type === "userTask") {
    const task = await ctx.db.get(project.currentActivity.userTaskId);
    if (task?.status === "open") await cancelTaskAndContinuation(ctx, task);
  }
}

async function cancelTaskAndContinuation(ctx: MutationCtx, task: Doc<"userTasks">) {
  await ctx.db.patch(task._id, { status: "cancelled" });
}

async function resolveActivity(ctx: QueryCtx, project: Doc<"projects">) {
  if (project.currentActivity.type === "draft") {
    return {
      type: "draft" as const,
      label: "Draft",
      phase: "sitePlan" as const,
      status: "waiting" as const,
      createdAt: project._creationTime,
    };
  }
  if (project.currentActivity.type === "completed") {
    return {
      type: "completed" as const,
      label: "Live",
      phase: "publishing" as const,
      status: "completed" as const,
      createdAt: project._creationTime,
    };
  }
  if (project.currentActivity.type === "work") {
    const work = await ctx.db.get(project.currentActivity.workId);
    if (!work) return null;
    return {
      type: "work" as const,
      label: work.label,
      phase: work.phase,
      status: work.status,
      createdAt: work._creationTime,
    };
  }
  const task = await ctx.db.get(project.currentActivity.userTaskId);
  if (!task) return null;
  return {
    type: "userTask" as const,
    label: task.label,
    phase: task.phase,
    status: task.status,
    createdAt: task._creationTime,
  };
}
