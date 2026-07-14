/**
 * Approval gates.
 *
 * This file is where the central trick of the system actually happens, and it is
 * almost nothing: approving flips `currentStage` to the next WORK stage. The worker
 * only leases work stages, so it picks the project up on its next tick, all by itself.
 *
 * That is the whole human-in-the-loop mechanism. There is no pause code, no resume
 * code, no signalling. Do not add any.
 */

import { v } from "convex/values";
import { nextStage } from "@factory/shared";
import { mutation } from "./_generated/server";

const SINGLE_USER = "owner";

export const approve = mutation({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, { reviewId }) => {
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error("Review not found");
    if (review.status !== "waiting") return;

    const project = await ctx.db.get(review.projectId);
    if (!project) throw new Error("Project not found");

    await ctx.db.patch(reviewId, {
      status: "approved",
      approvedBy: SINGLE_USER,
      approvedAt: Date.now(),
    });

    await ctx.db.insert("logs", {
      projectId: review.projectId,
      stage: project.currentStage,
      level: "info",
      message: `Approved ${review.artifactType} v${review.version}`,
    });

    // Flip to the next work stage. The worker does the rest.
    await ctx.db.patch(review.projectId, {
      currentStage: nextStage(project.currentStage, project.settings.mode),
    });
  },
});

/**
 * Rejection does NOT mutate the artifact — it sends the project back to the stage
 * that produced it, which will emit a NEW version. Artifacts are append-only:
 * `Specification v2` is the response to a rejected v1, never an edit of it.
 */
export const requestChanges = mutation({
  args: { reviewId: v.id("reviews"), comments: v.array(v.string()) },
  handler: async (ctx, { reviewId, comments }) => {
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error("Review not found");
    if (review.status !== "waiting") return;

    const project = await ctx.db.get(review.projectId);
    if (!project) throw new Error("Project not found");

    await ctx.db.patch(reviewId, { status: "needs_changes", comments });

    const REGENERATE_AT = {
      specification: "GeneratingSpecification",
      design: "GeneratingDesign",
      preview: "GeneratingCode",
    } as const;

    const back = REGENERATE_AT[review.artifactType as keyof typeof REGENERATE_AT];
    if (!back) return;

    await ctx.db.insert("logs", {
      projectId: review.projectId,
      stage: project.currentStage,
      level: "info",
      message: `Changes requested on ${review.artifactType} v${review.version}`,
      data: { comments },
    });

    await ctx.db.patch(review.projectId, { currentStage: back, attempts: 0 });
  },
});
