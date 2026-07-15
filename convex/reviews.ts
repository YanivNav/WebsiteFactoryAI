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

    const isTargetedScreenChange = comments.every((comment) => {
      try {
        const parsed = JSON.parse(comment) as { kind?: string };
        return parsed.kind === "screen-feedback";
      } catch {
        return false;
      }
    });
    if (review.artifactType === "design" && isTargetedScreenChange) {
      const artifact = await ctx.db.get(review.artifactId);
      const screenIds = new Set(
        (
          (artifact?.data as { screens?: Array<{ stitchScreenId?: string }> } | undefined)
            ?.screens ?? []
        )
          .map((screen) => screen.stitchScreenId)
          .filter(Boolean),
      );
      const targetsCurrentVersion = comments.every((comment) => {
        const screenId = (JSON.parse(comment) as { screenId?: string }).screenId;
        return Boolean(screenId && screenIds.has(screenId));
      });
      if (!targetsCurrentVersion) {
        throw new Error(
          "Older design versions are read-only. Reopen the latest version to revise it.",
        );
      }
    }
    const REGENERATE_AT = {
      specification: "GeneratingSpecification",
      design: isTargetedScreenChange ? "GeneratingDesign" : "GeneratingSpecification",
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

export const reviseSpecification = mutation({
  args: { reviewId: v.id("reviews"), specification: v.any() },
  handler: async (ctx, { reviewId, specification }) => {
    const review = await ctx.db.get(reviewId);
    if (!review || review.status !== "waiting" || review.artifactType !== "specification") return;
    const project = await ctx.db.get(review.projectId);
    if (!project || project.currentStage !== "WaitingForSpecificationApproval") return;
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_type", (q) =>
        q.eq("projectId", review.projectId).eq("type", "specification"),
      )
      .collect();
    const version = existing.length + 1;
    const artifactId = await ctx.db.insert("artifacts", {
      projectId: review.projectId,
      type: "specification",
      version,
      data: specification,
      promptHash: "",
      inputsHash: "",
    });
    await ctx.db.patch(reviewId, {
      status: "needs_changes",
      comments: ["Edited in site plan review"],
    });
    await ctx.db.insert("reviews", {
      projectId: review.projectId,
      artifactId,
      artifactType: "specification",
      version,
      status: "waiting",
      comments: [],
    });
    await ctx.db.insert("logs", {
      projectId: review.projectId,
      stage: project.currentStage,
      level: "info",
      message: `Site plan edited — version ${version}`,
    });
  },
});
