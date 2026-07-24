import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { cancelCurrentSiteAction, contentItemValidator, getLatestBuild, insertArtifact, requireProject } from "./utils";

/**
 * Post-publish change: a resting (completed) or ready project re-enters build
 * with a plain-language change request. The worker runs a scoped build and the
 * project stays in ready/completed.
 */
export const requestSiteChange = mutation({
  args: { projectId: v.id("projects"), feedback: v.string() },
  handler: async (ctx, { projectId, feedback }) => {
    const note = feedback.trim();
    if (!note) throw new Error("Describe the change you'd like");
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "changeRequest",
      status: "queued",
      data: { feedback: note },
    });
  },
});

/** Regenerate the site code from a clean scaffold, reusing the same Wix site. */
export const rebuildSiteClean = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "cleanRebuild",
      status: "queued",
      data: {},
    });
  },
});

/** Revert the site's code to a specific git commit. */
export const revertToCommit = mutation({
  args: { projectId: v.id("projects"), commit: v.string() },
  handler: async (ctx, { projectId, commit }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "revertToCommit",
      status: "queued",
      data: { commit },
    });
  },
});

/** Revert to a specific build artifact's recorded git commit. */
export const revertSiteTo = mutation({
  args: { projectId: v.id("projects"), buildArtifactId: v.id("artifacts") },
  handler: async (ctx, { projectId, buildArtifactId }) => {
    const project = await requireReadyProject(ctx, projectId);
    const build = await ctx.db.get(buildArtifactId);
    if (!build || build.projectId !== projectId || build.type !== "siteBuild") {
      throw new Error("That version is not available");
    }
    const commit = (build.data as { repoRevision?: string }).repoRevision;
    if (!commit) throw new Error("That version has no saved code revision");

    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "revertSiteTo",
      status: "queued",
      data: { commit, buildArtifactId },
    });
  },
});

/** Apply owner content edits from the control panel — no review task needed. */
export const applyContentReady = mutation({
  args: {
    projectId: v.id("projects"),
    items: v.array(contentItemValidator),
  },
  handler: async (ctx, { projectId, items }) => {
    await requireReadyProject(ctx, projectId);

    const latestBuild = await getLatestBuild(ctx, projectId);
    if (!latestBuild) throw new Error("This project has no build");

    const baseContentId = (latestBuild.data as { contentArtifactId?: Id<"artifacts"> }).contentArtifactId;
    const contentId = await insertArtifact(ctx, {
      projectId,
      type: "websiteContent",
      data: { items },
      basedOnArtifactId: baseContentId,
    });

    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "applyContent",
      status: "queued",
      data: { contentArtifactId: contentId },
    });
  },
});

/** Request a new screen or a redesign of an existing one from the control panel. */
export const requestScreenChange = mutation({
  args: {
    projectId: v.id("projects"),
    screenPath: v.string(),
    feedback: v.string(),
  },
  handler: async (ctx, { projectId, screenPath, feedback }) => {
    const note = feedback.trim();
    if (!note) throw new Error("Describe what you want the screen to look like");
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "screenChange",
      status: "queued",
      data: { screenPath, feedback: note },
    });
  },
});

/** Return from the control panel to the build timeline. */
export const returnToBuildMode = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);

    const latestBuild = await getLatestBuild(ctx, projectId);
    if (!latestBuild) throw new Error("This project has no build");

    await cancelCurrentSiteAction(ctx, projectId);

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

/** Generate a fresh preview by building the site and running wix preview. */
export const startPreview = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "preview",
      status: "queued",
      data: {},
    });
  },
});

/** Start the project's local Wix dev server as a long-lived process. */
export const startDevServer = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "startDev",
      status: "queued",
      data: {},
    });
  },
});

/** Stop the project's running dev server. */
export const stopDevServer = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);
    await ctx.db.insert("siteActions", {
      projectId,
      type: "stopDev",
      status: "queued",
      data: {},
    });
  },
});

/** Publish the site — queues the release and records the result. */
export const publishSite = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    await cancelCurrentSiteAction(ctx, projectId);

    const latestBuild = await getLatestBuild(ctx, projectId);
    if (!latestBuild) throw new Error("This project has no build to publish");

    await ctx.db.insert("siteActions", {
      projectId,
      type: "publish",
      status: "queued",
      data: { buildArtifactId: latestBuild._id },
    });
  },
});

/** Retry the last failed site action for a project. */
export const retrySiteAction = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireReadyProject(ctx, projectId);
    const failed = await ctx.db
      .query("siteActions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "failed"))
      .first();
    if (!failed || !failed.error?.retryable) return;
    await ctx.db.patch(failed._id, {
      status: "queued",
      workerId: undefined,
      leaseExpiresAt: undefined,
      error: undefined,
    });
  },
});

// ---- Helpers ---------------------------------------------------------------

async function requireReadyProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await requireProject(ctx, projectId);
  if (project.currentActivity.type !== "ready" && project.currentActivity.type !== "completed") {
    throw new Error("The site must be ready before making changes");
  }
  return project;
}
