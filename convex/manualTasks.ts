/**
 * Manual tasks — the "automation stopped, a human is needed" gate.
 *
 * Completing the last BLOCKING task advances the project, exactly like an approval
 * does. Same mechanism, no special casing.
 */

import { v } from "convex/values";
import { nextStage } from "@factory/shared";
import { mutation } from "./_generated/server";

export const complete = mutation({
  args: { taskId: v.id("manualTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.completed) return;

    await ctx.db.patch(taskId, { completed: true, completedAt: Date.now() });

    const project = await ctx.db.get(task.projectId);
    if (!project || project.currentStage !== "WaitingForManualActions") return;

    const remaining = await ctx.db
      .query("manualTasks")
      .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
      .collect();

    // Non-blocking tasks never hold the project up.
    if (remaining.some((t) => t.blocking && !t.completed)) return;

    await ctx.db.insert("logs", {
      projectId: task.projectId,
      stage: "WaitingForManualActions",
      level: "info",
      message: "All required actions completed",
    });

    // `WaitingForManualActions` is not in the linear flow, so we resume from the
    // stage that parked us here — provisioning — and carry on from there.
    await ctx.db.patch(task.projectId, {
      currentStage: nextStage("ProvisioningWix", project.settings.mode),
    });
  },
});
