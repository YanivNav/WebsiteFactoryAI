import {
  type Artifact,
  FIRST_OPERATION,
  OPERATION_FOR_OUTPUT,
  PHASE_REVIEW_ARTIFACT,
  WORK_DEFINITIONS,
} from "@factory/shared";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { buildWorkDraft, insertArtifact, insertWork, resolveArtifact } from "./utils";

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

    const draft = buildWorkDraft(FIRST_OPERATION, (type) =>
      type === "brief" ? briefId : project.approvedArtifacts[type],
    );
    const workId = await insertWork(
      ctx,
      projectId,
      { ...draft, instruction: { ...draft.instruction, revision: { mode: "initial" } } },
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

    // The workflow defines what comes next: the operation that produced the
    // reviewed artifact names its successor.
    const subjectId = chosenSubjectArtifactId ?? task.subjectArtifactId;
    const subject = await ctx.db.get(subjectId);
    if (!subject) throw new Error("Task subject is unavailable");
    const producingOperation = OPERATION_FOR_OUTPUT[subject.type];
    if (!producingOperation) throw new Error(`No workflow step produces ${subject.type}`);
    const nextWork = WORK_DEFINITIONS[producingOperation].next;

    if (nextWork === "completeProject") {
      // Copy preview URLs from the build artifact into project.wix so the
      // control panel shows them. These come from real Wix CLI output.
      const build = subject.type === "siteBuild"
        ? (subject.data as { previewUrl?: string; dashboardUrl?: string })
        : null;
      const patch: Record<string, unknown> = {
        approvedArtifacts,
        currentActivity: { type: "ready" as const },
      };
      if (build?.previewUrl || build?.dashboardUrl) {
        const existing = project.wix ?? {};
        const wix: Record<string, string | undefined> = { ...existing };
        if (build.previewUrl) wix.previewUrl = build.previewUrl;
        if (build.dashboardUrl) wix.previewDashboardUrl = build.dashboardUrl;
        patch.wix = wix;
      }
      await ctx.db.patch(project._id, patch);
      return;
    }

    // The just-approved artifacts are already in approvedArtifacts, so inputs
    // resolve to them where the types match.
    const draft = buildWorkDraft(nextWork, (type) => approvedArtifacts[type]);
    const nextWorkId = await insertWork(ctx, project._id, draft, "queued");
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
    // For design reviews: regenerate only this screen (by page path) instead of all.
    screenPath: v.optional(v.string()),
  },
  handler: async (ctx, { userTaskId, sourceArtifactId, feedback, screenPath }) => {
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
            screenPath: screenPath || undefined,
          },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

/** Upload URL for owner-provided content assets (images, logo). Single-user app. */
export const generateContentUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

const contentItemValidator = v.object({
  key: v.string(),
  label: v.string(),
  kind: v.union(
    v.literal("text"),
    v.literal("longtext"),
    v.literal("image"),
    v.literal("logo"),
    v.literal("setting"),
  ),
  page: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  help: v.optional(v.string()),
  helpLink: v.optional(v.string()),
  helpUrl: v.optional(v.string()),
  value: v.union(v.string(), v.null()),
  assetId: v.optional(v.string()),
});

/**
 * The refine loop's content-edit path: the owner edits the site's one-off
 * content, which creates a new `websiteContent` version and re-runs the build
 * to bake it in. AI text changes go through `reviseCurrentTask` instead.
 */
export const applyContent = mutation({
  args: {
    userTaskId: v.id("userTasks"),
    sourceArtifactId: v.id("artifacts"),
    items: v.array(contentItemValidator),
  },
  handler: async (ctx, { userTaskId, sourceArtifactId, items }) => {
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
    if (source.type !== "siteBuild" || !source.createdByWorkId) {
      throw new Error("Content can only be applied to a site build");
    }
    const producingWork = await ctx.db.get(source.createdByWorkId);
    if (!producingWork || producingWork.projectId !== project._id) {
      throw new Error("The original work is unavailable");
    }

    // New content version based on whatever the build baked in.
    const baseContentId = (source.data as { contentArtifactId?: Id<"artifacts"> }).contentArtifactId;
    const contentId = await insertArtifact(ctx, {
      projectId: project._id,
      type: "websiteContent",
      data: { items },
      basedOnArtifactId: baseContentId,
      createdByUserTaskId: task._id,
    });

    await cancelTaskAndContinuation(ctx, task);
    const workId = await insertWork(
      ctx,
      project._id,
      {
        phase: producingWork.phase,
        label: producingWork.label,
        instruction: {
          ...producingWork.instruction,
          revision: { mode: "revise", baseArtifactId: source._id, contentArtifactId: contentId },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Post-publish change: a resting (`completed`) or ready project re-enters the build
 * stage with a plain-language change request. It then flows through a scoped agent
 * run and returns to ready.
 */
export const requestSiteChange = mutation({
  args: { projectId: v.id("projects"), feedback: v.string() },
  handler: async (ctx, { projectId, feedback }) => {
    const note = feedback.trim();
    if (!note) throw new Error("Describe the change you'd like");
    const project = await requireProject(ctx, projectId);

    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("This project has no build to change");

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      project._id,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "revise", baseArtifactId: latestBuild._id, feedback: note },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Regenerate the site code from a clean scaffold, reusing the same Wix site,
 * repository, spec, design, and owner content. Works whether the project is on
 * the build review or resting (completed). Used to test build-quality changes
 * without the agent building over previously-generated code.
 */
export const rebuildSiteClean = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("This project has no build to rebuild");

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      project._id,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "regenerate", baseArtifactId: latestBuild._id, cleanRebuild: true },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Restore the site to an earlier build. Git holds the site's real version
 * history, so this replays that build's commit into the working tree and
 * commits it forward — the version you reverted from stays in history.
 */
/** Revert the site's code to a specific git commit. Works from the control panel. */
export const revertToCommit = mutation({
  args: { projectId: v.id("projects"), commit: v.string() },
  handler: async (ctx, { projectId, commit }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("Cannot revert while the site is busy");
    }
    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("No build to revert from");

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "regenerate", baseArtifactId: latestBuild._id, revertToCommit: commit },
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

export const revertSiteTo = mutation({
  args: { projectId: v.id("projects"), buildArtifactId: v.id("artifacts") },
  handler: async (ctx, { projectId, buildArtifactId }) => {
    const project = await requireProject(ctx, projectId);
    const build = await ctx.db.get(buildArtifactId);
    if (!build || build.projectId !== projectId || build.type !== "siteBuild") {
      throw new Error("That version is not available");
    }
    const commit = (build.data as { repoRevision?: string }).repoRevision;
    if (!commit) throw new Error("That version has no saved code revision");

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      project._id,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "regenerate", baseArtifactId: build._id, revertToCommit: commit },
        },
      },
      "queued",
    );
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Queue a revision for a single screen while its design work is still generating.
 * The running handler drains pending rows after each screen and regenerates the
 * requested one right after the screen it is currently working on.
 */
export const requestScreenRevision = mutation({
  args: {
    workId: v.id("works"),
    screenPath: v.string(),
    feedback: v.string(),
  },
  handler: async (ctx, { workId, screenPath, feedback }) => {
    const note = feedback.trim();
    if (!note) return;
    const work = await ctx.db.get(workId);
    if (!work || !["queued", "running"].includes(work.status)) {
      throw new Error("This design is no longer generating");
    }
    await ctx.db.insert("screenRevisions", {
      projectId: work.projectId,
      workId,
      screenPath,
      feedback: note,
      status: "pending",
    });
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

/**
 * Apply owner content edits from the ready control panel — no review task needed.
 * Creates a new websiteContent version and queues a scoped buildSite to bake it in.
 */
export const applyContentReady = mutation({
  args: {
    projectId: v.id("projects"),
    items: v.array(contentItemValidator),
  },
  handler: async (ctx, { projectId, items }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("Content can only be applied when the site is ready");
    }
    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("This project has no build");

    const baseContentId = (latestBuild.data as { contentArtifactId?: Id<"artifacts"> }).contentArtifactId;
    const contentId = await insertArtifact(ctx, {
      projectId,
      type: "websiteContent",
      data: { items },
      basedOnArtifactId: baseContentId,
    });

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "revise", baseArtifactId: latestBuild._id, contentArtifactId: contentId },
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Request a new screen or a redesign of an existing one from the control panel.
 * Queues a scoped buildSite work — the agent adds or redesigns the page in place.
 * (A future iteration will route new screens through Stitch design first.)
 */
export const requestScreenChange = mutation({
  args: {
    projectId: v.id("projects"),
    screenPath: v.string(),
    feedback: v.string(),
  },
  handler: async (ctx, { projectId, screenPath, feedback }) => {
    const note = feedback.trim();
    if (!note) throw new Error("Describe what you want the screen to look like");
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("Screen changes can only be made when the site is ready");
    }
    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("This project has no build");

    const existingDesign = project.approvedArtifacts.design;
    const isRedesign = existingDesign
      ? ((await ctx.db.get(existingDesign))?.data as { screens?: Array<{ path: string }> } | null)
          ?.screens?.some((s) => s.path === screenPath)
      : false;
    const instruction = isRedesign
      ? `Redesign the page at ${screenPath}: ${note}`
      : `Add a new page at ${screenPath}. Design it for the following: ${note}`;

    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "revise", baseArtifactId: latestBuild._id, feedback: instruction, screenPath },
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Return from the control panel to the build timeline so the user can revise
 * the last build, revisit earlier steps, or restart from the brief.
 */
export const returnToBuildMode = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("The site must be ready before returning to build mode");
    }
    const latestBuild = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) => q.eq("projectId", projectId).eq("type", "siteBuild"))
      .order("desc")
      .first();
    if (!latestBuild) throw new Error("This project has no build");

    const taskId = await ctx.db.insert("userTasks", {
      projectId,
      phase: "siteBuild",
      label: "Review your site",
      subjectArtifactId: latestBuild._id,
      result: { type: "selectVersion" },
      status: "open",
    });
    await ctx.db.patch(projectId, {
      currentActivity: { type: "userTask", userTaskId: taskId },
    });
  },
});

/**
 * Start a local dev server for the site. Queues a lightweight work that runs
 * `wix dev`, captures the localhost URL, and writes it to the project record.
 */
/**
 * Generate a fresh preview — builds the site and runs `wix preview`, then
 * writes the preview URL to the project record.
 */
export const startPreview = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("Preview can only be generated when the site is ready");
    }
    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "initial", previewOnly: true } as any,
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

export const startDevServer = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("Dev server can only be started when the site is ready");
    }
    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "initial", devOnly: true } as any,
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Stop the project's running dev server. Queues a fast trigger work; the worker's
 * DevServerManager kills the background process and marks the session stopped.
 */
export const stopDevServer = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("The dev server can only be stopped when the site is ready");
    }
    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("buildSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(
      ctx,
      projectId,
      {
        ...draft,
        instruction: {
          ...draft.instruction,
          revision: { mode: "initial", stopDev: true } as any,
        },
      },
      "queued",
    );
    await ctx.db.patch(projectId, { currentActivity: { type: "work", workId } });
  },
});

/**
 * Publish the site from the control panel — a standalone action, not a pipeline
 * phase. Queues the release work and returns to ready when it completes.
 */
export const publishSite = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
      throw new Error("The site must be ready before publishing");
    }
    await cancelCurrentActivity(ctx, project);
    const draft = buildWorkDraft("publishSite", (type) => project.approvedArtifacts[type]);
    const workId = await insertWork(ctx, project._id, draft, "queued");
    await ctx.db.patch(project._id, { currentActivity: { type: "work", workId } });
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
      const revisions = await ctx.db
        .query("screenRevisions")
        .withIndex("by_work_and_status", (q) => q.eq("workId", work._id))
        .collect();
      for (const item of revisions) await ctx.db.delete(item._id);
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

export const deleteArtifact = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, { artifactId }) => {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact) throw new Error("Artifact not found");

    const project = await requireProject(ctx, artifact.projectId);
    if (project.approvedArtifacts[artifact.type] === artifactId) {
      throw new Error("Cannot delete the approved version");
    }

    const versions = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) =>
        q.eq("projectId", artifact.projectId).eq("type", artifact.type),
      )
      .collect();
    if (versions.length <= 1) throw new Error("Cannot delete the only version");

    // If deleting the version shown in the active task, switch the task to the
    // latest remaining version so the UI doesn't break.
    if (project.currentActivity.type === "userTask") {
      const task = await ctx.db.get(project.currentActivity.userTaskId);
      if (task?.status === "open") {
        const remaining = versions
          .filter((v) => v._id !== artifactId)
          .toSorted((a, b) => b.version - a.version);
        const replacement = remaining[0];
        const patch: Partial<Doc<"userTasks">> = {};
        if (task.subjectArtifactId === artifactId) patch.subjectArtifactId = replacement._id;
        if (task.chosenSubjectArtifactId === artifactId) patch.chosenSubjectArtifactId = replacement._id;
        if (Object.keys(patch).length > 0) await ctx.db.patch(task._id, patch);
      }
    }

    // Revisions carry assets forward by reference, so a blob may be shared with
    // other versions. Only delete storage no surviving version references.
    const referencedElsewhere = new Set(
      versions
        .filter((version) => version._id !== artifactId)
        .flatMap((version) => version.assets.map((asset) => asset.storageId)),
    );
    for (const asset of artifact.assets) {
      if (!referencedElsewhere.has(asset.storageId)) await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(artifactId);
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
    const progressEntries = currentWork
      ? await ctx.db
          .query("workProgress")
          .withIndex("by_work_and_attempt", (q) =>
            q.eq("workId", currentWork._id).eq("attempt", currentWork.attempt),
          )
          .order("desc")
          .collect()
      : [];
    // Live design progress: the accumulated screens plus the Stitch project
    // link. Kept separate from `progress` so it exists even before the worker
    // has written the first progress entry (e.g. a freshly queued revision).
    const designProgress = currentWork?.instruction.type === "generateDesign"
      ? {
          completedScreens: await accumulateDesignScreens(ctx, currentWork, progressEntries),
          stitchProjectId:
            (progressEntries.find((entry) => entry.data?.stitchProjectId)?.data
              ?.stitchProjectId as string | undefined) ?? null,
        }
      : null;
    const progress = progressEntries[0] ?? null;
    const resolvedArtifacts: Artifact[] = await Promise.all(
      artifacts.map((artifact) => resolveArtifact(ctx, artifact)),
    );

    const devSession = await ctx.db
      .query("devSessions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();

    return {
      project,
      currentWork,
      currentUserTask,
      works,
      userTasks,
      progress,
      designProgress,
      logs,
      artifacts: resolvedArtifacts,
      // The streaming dev logs live on their own `devConsole` query so they don't
      // re-run this heavy one; only the (rarely-changing) session is here.
      devSession,
    };
  },
});

/**
 * The dev server console: the session plus a generous tail of streamed output.
 * Kept separate from `detail` so high-frequency log streaming doesn't re-run the
 * project detail query — and so a full stack trace isn't lost to a small window.
 */
export const devConsole = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const session = await ctx.db
      .query("devSessions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
    if (!session) return { session: null, logs: [] };
    // Newest 1500 lines from the index, returned chronological.
    const logsDesc = await ctx.db
      .query("devLogs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(1500);
    return { session, logs: logsDesc.reverse() };
  },
});

async function requireProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

/**
 * Accumulate the completed screens of a design work. During a single-screen
 * revision every other screen of the base design is kept as-is, so those are
 * seeded from the base artifact right away — the UI shows them the moment the
 * work exists, before the worker has reported anything. Progress entries may
 * carry a `completedScreen` record with `name`, `path`, `imageUrl`, and
 * `htmlUrl`; later entries for the same path overwrite earlier ones (and the
 * baseline), so the returned list reflects the latest state of every screen.
 */
async function accumulateDesignScreens(
  ctx: QueryCtx,
  work: Doc<"works">,
  progressEntries: Doc<"workProgress">[],
) {
  const byPath = new Map<string, { name: string; path: string; imageUrl: string | null; htmlUrl: string | null }>();

  const revision = work.instruction.revision;
  if (revision?.screenPath && revision.baseArtifactId) {
    const base = await ctx.db.get(revision.baseArtifactId);
    if (base && base.type === "design") {
      const resolved = (await resolveArtifact(ctx, base)) as Artifact<"design">;
      const assetById = new Map(resolved.assets.map((asset) => [asset.id, asset]));
      for (const screen of resolved.data.screens) {
        if (screen.path === revision.screenPath) continue;
        byPath.set(screen.path, {
          name: screen.name,
          path: screen.path,
          imageUrl: assetById.get(screen.imageAssetId)?.url ?? null,
          htmlUrl: assetById.get(screen.htmlAssetId)?.url ?? null,
        });
      }
    }
  }

  // Walk from oldest to newest so later entries win.
  for (const entry of progressEntries.toReversed()) {
    const data = entry.data as Record<string, unknown> | undefined;
    const screen = data?.completedScreen as
      | { name: string; path: string; imageUrl: string | null; htmlUrl: string | null }
      | undefined;
    if (screen?.path) byPath.set(screen.path, screen);
  }
  return [...byPath.values()];
}

async function requireTaskArtifact(
  ctx: MutationCtx,
  task: Doc<"userTasks">,
  artifactId: Id<"artifacts">,
) {
  const artifact = await ctx.db.get(artifactId);
  if (!artifact || artifact.projectId !== task.projectId) throw new Error("Version not found");
  const subject = await ctx.db.get(task.subjectArtifactId);
  // The subject may have been deleted — fall back to the type this phase reviews.
  const expectedType = subject?.type ?? PHASE_REVIEW_ARTIFACT[task.phase];
  if (expectedType && artifact.type !== expectedType) {
    throw new Error("That version cannot be used for this task");
  }
  return artifact;
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
  if (project.currentActivity.type === "ready") {
    return {
      type: "ready" as const,
      label: "Ready",
      phase: "siteBuild" as const,
      status: "ready" as const,
      createdAt: project._creationTime,
    };
  }
  if (project.currentActivity.type === "completed") {
    return {
      type: "completed" as const,
      label: "Live",
      phase: "siteBuild" as const,
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
