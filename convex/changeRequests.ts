/**
 * The collaboration queue.
 *
 * Two people on two computers both submit change requests here. The worker's lease
 * serializes them against one canonical workspace, so there is only ever ONE writer.
 * Merge conflicts are structurally impossible — which is why this system has no
 * branches, no pushes, and no AI conflict resolution, and never needs any.
 *
 * `Completed` is a resting state. This is what wakes a project back up.
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";

const SINGLE_USER = "owner";

export const create = mutation({
  args: { projectId: v.id("projects"), description: v.string() },
  handler: async (ctx, { projectId, description }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");

    await ctx.db.insert("changeRequests", {
      projectId,
      description,
      status: "queued",
      requestedBy: SINGLE_USER,
    });

    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "Change requested",
      data: { description },
    });

    // Only wake a resting project. If one is already mid-flight, the request simply
    // waits its turn in the queue — that queueing IS the conflict-avoidance.
    if (project.currentStage === "Completed") {
      await ctx.db.patch(projectId, {
        currentStage: "GeneratingCode",
        status: "active",
        attempts: 0,
      });
    }
  },
});
