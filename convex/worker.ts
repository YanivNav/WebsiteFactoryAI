/** Atomic queue operations used by the background worker. */
import { isRunnableStage, STAGES } from "@factory/shared";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { artifactTypeValidator, stageValidator } from "./schema";
import { resolveArtifact } from "./utils";

const RUNNABLE_STAGES = STAGES.filter(isRunnableStage);

export const leaseNextRunnable = mutation({
  args: { workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { workerId, ttlSeconds }) => {
    const now = Date.now();

    for (const stage of RUNNABLE_STAGES) {
      const candidates = await ctx.db
        .query("projects")
        .withIndex("by_stage", (q) => q.eq("currentStage", stage))
        .collect();
      const project = candidates.find(
        (candidate) =>
          candidate.status === "active" &&
          (candidate.leaseWorkerId === undefined || (candidate.leaseExpiresAt ?? 0) < now),
      );
      if (!project) continue;

      await ctx.db.patch(project._id, {
        leaseWorkerId: workerId,
        leaseExpiresAt: now + ttlSeconds * 1000,
      });

      const generationRequest = project.pendingGenerationRequestId
        ? await ctx.db.get(project.pendingGenerationRequestId)
        : null;

      return {
        id: project._id,
        title: project.title,
        currentStage: project.currentStage,
        settings: project.settings,
        generationRequest: generationRequest
          ? {
              id: generationRequest._id,
              outputType: generationRequest.outputType,
              mode: generationRequest.mode,
              inputs: generationRequest.inputs,
              baseArtifactId: generationRequest.baseArtifactId,
              feedback: generationRequest.feedback,
            }
          : undefined,
      };
    }

    return null;
  },
});

export const renewLease = mutation({
  args: { projectId: v.id("projects"), workerId: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { projectId, workerId, ttlSeconds }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.leaseWorkerId !== workerId) return;
    await ctx.db.patch(projectId, { leaseExpiresAt: Date.now() + ttlSeconds * 1000 });
  },
});

export const appendLog = mutation({
  args: {
    projectId: v.id("projects"),
    stage: stageValidator,
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, input) => {
    await ctx.db.insert("logs", input);
  },
});

export const addArtifact = mutation({
  args: {
    projectId: v.id("projects"),
    type: artifactTypeValidator,
    data: v.any(),
    sourceArtifactId: v.optional(v.id("artifacts")),
    generationRequestId: v.optional(v.id("generationRequests")),
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) =>
        q.eq("projectId", input.projectId).eq("type", input.type),
      )
      .collect();
    const project = await ctx.db.get("projects", input.projectId);
    if (!project) return;

    const version = existing.length + 1;
    const sourceArtifactId = input.sourceArtifactId;
    if (sourceArtifactId) {
      const source = await ctx.db.get(sourceArtifactId);
      if (
        !source ||
        source.projectId !== input.projectId ||
        source.type !== input.type ||
        source.planningCycle !== project.planningCycle
      ) {
        throw new Error("Artifact source does not match the new version");
      }
    }
    if (input.generationRequestId) {
      const request = await ctx.db.get(input.generationRequestId);
      if (
        !request ||
        request.projectId !== input.projectId ||
        project.pendingGenerationRequestId !== request._id
      ) {
        throw new Error("Generation request does not belong to this project");
      }

      const existingOutput = await ctx.db
        .query("artifacts")
        .withIndex("by_generation_request_and_type", (q) =>
          q.eq("generationRequestId", request._id).eq("type", input.type),
        )
        .first();
      if (existingOutput) {
        return resolveArtifact(ctx, existingOutput);
      }
    }
    const artifactId = await ctx.db.insert("artifacts", {
      projectId: input.projectId,
      type: input.type,
      data: input.data,
      sourceArtifactId,
      generationRequestId: input.generationRequestId,
      version,
      planningCycle: project.planningCycle,
      assets: [],
    });

    return {
      id: artifactId,
      type: input.type,
      data: input.data,
      version,
      planningCycle: project.planningCycle,
      sourceArtifactId,
      generationRequestId: input.generationRequestId,
      assets: [],
    };
  },
});

export const setProgress = mutation({
  args: { projectId: v.id("projects"), progress: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.projectId, {
      progress: args.progress,
    });
  },
});

export const getCurrentArtifact = query({
  args: {
    projectId: v.id("projects"),
    type: artifactTypeValidator,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return;

    const currentArtifactId = project.currentArtifacts?.[args.type];
    if (currentArtifactId) {
      const currentArtifact = await ctx.db.get(currentArtifactId);
      if (
        currentArtifact &&
        currentArtifact.projectId === args.projectId &&
        currentArtifact.type === args.type
      ) {
        return resolveArtifact(ctx, currentArtifact);
      }
    }

    // Backward-compatible fallback for projects created before the manifest was
    // introduced. The next user decision promotes an explicit pointer.
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_type", (q) =>
        q.eq("projectId", args.projectId).eq("type", args.type),
      )
      .collect();
    const currentCycleArtifacts = artifacts.filter(
      (artifact) => artifact.planningCycle === project.planningCycle,
    );
    if (!currentCycleArtifacts.length) return;

    const artifact = currentCycleArtifacts.toSorted((a, b) => b.version - a.version)[0];
    return artifact ? resolveArtifact(ctx, artifact) : undefined;
  },
});

export const getArtifact = query({
  args: {
    projectId: v.id("projects"),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, { projectId, artifactId }) => {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact || artifact.projectId !== projectId) return;
    return resolveArtifact(ctx, artifact);
  },
});

export const commitResult = mutation({
  args: {
    projectId: v.id("projects"),
    workerId: v.string(),
    result: v.union(
      v.object({ kind: v.literal("advance"), next: stageValidator }),
      v.object({
        kind: v.literal("awaitArtifact"),
        next: stageValidator,
        artifactId: v.id("artifacts"),
        gateKind: v.union(v.literal("answers"), v.literal("review")),
      }),
      v.object({ kind: v.literal("failed"), error: v.string() }),
    ),
  },
  handler: async (ctx, { projectId, workerId, result }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");

    if (project.leaseWorkerId !== workerId) return;

    const releaseLease = { leaseWorkerId: undefined, leaseExpiresAt: undefined };

    if (result.kind === "advance") {
      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        progress: 0,
        status: result.next === "Completed" ? "completed" : "active",
        lastError: undefined,
        gate: undefined,
        pendingGenerationRequestId: undefined,
      });
      return;
    }

    if (result.kind === "awaitArtifact") {
      const artifact = await ctx.db.get(result.artifactId);
      if (!artifact || artifact.projectId !== projectId) {
        throw new Error("The artifact gate points to an invalid artifact");
      }
      const request = project.pendingGenerationRequestId
        ? await ctx.db.get(project.pendingGenerationRequestId)
        : null;
      const requestCompleted =
        request &&
        artifact.generationRequestId === request._id &&
        artifact.type === request.outputType;

      await ctx.db.patch(projectId, {
        ...releaseLease,
        currentStage: result.next,
        progress: 0,
        status: "active",
        lastError: undefined,
        gate: {
          kind: result.gateKind,
          selectedArtifactId: artifact._id,
          ...(requestCompleted && request.parentRequestId
            ? { resumeGenerationRequestId: request.parentRequestId }
            : {}),
        },
        pendingGenerationRequestId: requestCompleted
          ? undefined
          : project.pendingGenerationRequestId,
      });
      return;
    }

    if (result.kind === "failed") {
      await ctx.db.patch(projectId, {
        ...releaseLease,
        progress: 0,
        lastError: result.error,
        // Failed work is parked. The lease query only selects active projects, so
        // another attempt can happen only through the explicit Retry action.
        status: "failed",
      });
    }
  },
});
