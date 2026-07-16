/**
 * Manual tasks — the "automation stopped, a human is needed" gate.
 *
 * Completing the last BLOCKING task advances the project, exactly like an approval
 * does. Same mechanism, no special casing.
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const complete = mutation({
  args: { taskId: v.id("manualTasks"), configurationValue: v.optional(v.string()) },
  handler: async (ctx, { taskId, configurationValue }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.completed) return;

    const needsValue = /^Configure \S+ for /.test(task.title);
    const value = configurationValue?.trim();
    if (needsValue && !value) throw new Error("Enter the required value before marking this done");

    await ctx.db.patch(taskId, {
      completed: true,
      configurationValue: value,
      completedAt: Date.now(),
    });

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

    // Resume the work that requested human input. Skipping to its successor would
    // record a stage as successful even though it never ran with the new setup.
    await ctx.db.patch(task.projectId, {
      currentStage: task.stage,
    });
  },
});
