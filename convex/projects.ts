/** Dashboard-facing project CRUD and minimal waiting-gate controls. */
import {
  type Artifact,
  type ArtifactType,
  isRunnableStage,
  isWaitingStage,
  nextStage,
  previousStage,
} from "@factory/shared";
import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveArtifact } from "./utils";

const SINGLE_USER = "owner";

export const create = mutation({
  args: { title: v.string(), brief: v.string() },
  handler: async (ctx, { title, brief }) => {
    const projectId = await ctx.db.insert("projects", {
      title,
      owner: SINGLE_USER,
      status: "active",
      planningCycle: 0,
      currentStage: "Draft",
      currentArtifacts: {},
      settings: { mode: "simple", publishTarget: "wix-managed" },
    });

    const briefArtifact = await ctx.runMutation(api.worker.addArtifact, {
      projectId,
      type: "brief",
      data: brief,
    });
    if (!briefArtifact) throw new Error("Could not save the project brief");
    await ctx.db.patch(projectId, {
      currentArtifacts: { brief: briefArtifact.id as Id<"artifacts"> },
    });

    await ctx.db.insert("logs", {
      projectId,
      stage: "Draft",
      level: "info",
      message: "Project created",
    });

    return projectId;
  },
});

export const start = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (project.currentStage !== "Draft") return;

    const brief = await ctx.runQuery(api.worker.getCurrentArtifact, {
      projectId,
      type: "brief",
    });
    if (!brief) throw new Error("Project brief not found");
    const currentArtifacts = {
      ...(project.currentArtifacts ?? {}),
      brief: brief.id as Id<"artifacts">,
    };
    const requestId = await createGenerationRequest(ctx, project, {
      outputType: "questions",
      mode: "initial",
      inputs: currentArtifacts,
    });

    await ctx.db.patch(projectId, {
      currentStage: nextStage("Draft"),
      status: "active",
      currentArtifacts,
      pendingGenerationRequestId: requestId,
    });
  },
});

/**
 * Minimal stand-in for future review forms and manual actions. Waiting stages remain
 * non-runnable; the user explicitly advances them and the worker picks up the result.
 */
export const continueFromGate = mutation({
  args: {
    projectId: v.id("projects"),
    artifactId: v.optional(v.id("artifacts")),
    stageData: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, artifactId, stageData }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isWaitingStage(project.currentStage) || project.currentStage === "Completed") return;
    let gate = project.gate;
    if (artifactId) {
      const artifact = await ctx.db.get(artifactId);
      if (!artifact || artifact.projectId !== projectId) throw new Error("Version not found");
      if (gate) {
        const gatedArtifact = await ctx.db.get(gate.selectedArtifactId);
        if (!gatedArtifact || gatedArtifact.type !== artifact.type) {
          throw new Error("That version cannot be used for this decision");
        }
      }
      gate = gate
        ? { ...gate, selectedArtifactId: artifactId }
        : {
            selectedArtifactId: artifactId,
            kind: artifact.type === "questions" ? ("answers" as const) : ("review" as const),
          };
    }
    if (!gate) throw new Error("There is nothing to continue yet");

    const selectedArtifact = await ctx.db.get(gate.selectedArtifactId);
    if (!selectedArtifact || selectedArtifact.projectId !== projectId) {
      throw new Error("The selected version is no longer available");
    }

    let promotedArtifactId = selectedArtifact._id;
    if (gate.kind === "answers") {
      if (!Array.isArray(stageData)) throw new Error("Question answers are required");
      const answeredArtifact = await ctx.runMutation(api.worker.addArtifact, {
        projectId,
        type: "questions",
        data: stageData,
        sourceArtifactId: selectedArtifact._id,
      });
      if (!answeredArtifact) throw new Error("Could not save the answers");
      promotedArtifactId = answeredArtifact.id as Id<"artifacts">;
    }

    const currentArtifacts = {
      ...(project.currentArtifacts ?? {}),
      [selectedArtifact.type]: promotedArtifactId,
    };
    const pendingGenerationRequestId =
      gate.kind === "answers"
        ? await createSpecificationRequestAfterAnswers(
            ctx,
            project,
            currentArtifacts,
            selectedArtifact,
          )
        : undefined;

    const next = nextStage(project.currentStage);
    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "User continued the project",
    });
    await ctx.db.patch(projectId, {
      currentStage: next,
      status: "active",
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      currentArtifacts,
      gate: undefined,
      pendingGenerationRequestId,
    });
  },
});

export const regenerateStage = mutation({
  args: {
    projectId: v.id("projects"),
    sourceArtifactId: v.optional(v.id("artifacts")),
    feedback: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, sourceArtifactId, feedback }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isWaitingStage(project.currentStage) || project.currentStage === "Completed") return;

    const selectedArtifactId = sourceArtifactId ?? project.gate?.selectedArtifactId;
    if (!selectedArtifactId) throw new Error("There is no selected version to regenerate");
    const source = await ctx.db.get(selectedArtifactId);
    const gatedArtifact = project.gate ? await ctx.db.get(project.gate.selectedArtifactId) : null;
    if (
      !source ||
      source.projectId !== projectId ||
      (gatedArtifact && source.type !== gatedArtifact.type)
    ) {
      throw new Error("The selected version is no longer available");
    }
    const note = typeof feedback === "string" ? feedback.trim() : "";
    const parentRequestId =
      source.type === "questions"
        ? (project.pendingGenerationRequestId ?? project.gate?.resumeGenerationRequestId)
        : undefined;
    const requestId = await createGenerationRequest(ctx, project, {
      outputType: source.type,
      mode: note ? "revise" : "regenerate",
      inputs: project.currentArtifacts ?? {},
      baseArtifactId: source._id,
      feedback: note || undefined,
      parentRequestId,
    });

    const target = previousStage(project.currentStage);
    await ctx.db.insert("logs", {
      projectId,
      stage: project.currentStage,
      level: "info",
      message: "User asked to regenerate",
    });
    await ctx.db.patch(projectId, {
      currentStage: target,
      status: "active",
      progress: 0,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
      gate: undefined,
      pendingGenerationRequestId: requestId,
    });
  },
});

export const selectArtifactVersion = mutation({
  args: { projectId: v.id("projects"), artifactId: v.id("artifacts") },
  handler: async (ctx, { projectId, artifactId }) => {
    const [project, artifact] = await Promise.all([ctx.db.get(projectId), ctx.db.get(artifactId)]);
    if (!project || !artifact || artifact.projectId !== projectId) {
      throw new Error("Version not found");
    }
    if (artifact.planningCycle !== project.planningCycle) {
      throw new Error("That version cannot be selected here");
    }
    if (project.gate) {
      const gatedArtifact = await ctx.db.get(project.gate.selectedArtifactId);
      if (!gatedArtifact || artifact.type !== gatedArtifact.type) {
        throw new Error("That version cannot be selected here");
      }
    }
    if (!isWaitingStage(project.currentStage) || project.currentStage === "Completed") return;
    const gate = project.gate ?? {
      kind: artifact.type === "questions" ? ("answers" as const) : ("review" as const),
      selectedArtifactId: artifactId,
    };
    await ctx.db.patch(projectId, {
      gate: { ...gate, selectedArtifactId: artifactId },
    });
  },
});

type ArtifactManifest = NonNullable<Doc<"projects">["currentArtifacts"]>;

async function createGenerationRequest(
  ctx: MutationCtx,
  project: Doc<"projects">,
  request: {
    outputType: ArtifactType;
    mode: "initial" | "regenerate" | "revise";
    inputs: ArtifactManifest;
    baseArtifactId?: Id<"artifacts">;
    feedback?: string;
    parentRequestId?: Id<"generationRequests">;
  },
) {
  for (const [type, artifactId] of Object.entries(request.inputs)) {
    const artifact = await ctx.db.get(artifactId);
    if (
      !artifact ||
      artifact.projectId !== project._id ||
      artifact.type !== type ||
      artifact.planningCycle !== project.planningCycle
    ) {
      throw new Error(`Invalid ${type} input for this generation request`);
    }
  }
  if (request.baseArtifactId) {
    const base = await ctx.db.get(request.baseArtifactId);
    if (
      !base ||
      base.projectId !== project._id ||
      base.type !== request.outputType ||
      base.planningCycle !== project.planningCycle
    ) {
      throw new Error("Invalid base version for this generation request");
    }
  }
  if (request.parentRequestId) {
    const parent = await ctx.db.get(request.parentRequestId);
    if (!parent || parent.projectId !== project._id) {
      throw new Error("Invalid parent generation request");
    }
  }

  return ctx.db.insert("generationRequests", {
    projectId: project._id,
    planningCycle: project.planningCycle,
    outputType: request.outputType,
    mode: request.mode,
    inputs: request.inputs,
    ...(request.baseArtifactId ? { baseArtifactId: request.baseArtifactId } : {}),
    ...(request.feedback ? { feedback: request.feedback } : {}),
    ...(request.parentRequestId ? { parentRequestId: request.parentRequestId } : {}),
  });
}

async function createSpecificationRequestAfterAnswers(
  ctx: MutationCtx,
  project: Doc<"projects">,
  inputs: ArtifactManifest,
  selectedQuestions: Doc<"artifacts">,
) {
  let previousRequest = project.pendingGenerationRequestId
    ? await ctx.db.get(project.pendingGenerationRequestId)
    : null;

  if (!previousRequest && project.gate?.resumeGenerationRequestId) {
    previousRequest = await ctx.db.get(project.gate.resumeGenerationRequestId);
  }

  if (!previousRequest && selectedQuestions.generationRequestId) {
    const questionRequest = await ctx.db.get(selectedQuestions.generationRequestId);
    if (questionRequest?.parentRequestId) {
      previousRequest = await ctx.db.get(questionRequest.parentRequestId);
    }
  }

  if (previousRequest?.outputType === "specification") {
    return createGenerationRequest(ctx, project, {
      outputType: "specification",
      mode: previousRequest.mode,
      inputs,
      baseArtifactId: previousRequest.baseArtifactId,
      feedback: previousRequest.feedback,
      parentRequestId: previousRequest._id,
    });
  }

  return createGenerationRequest(ctx, project, {
    outputType: "specification",
    mode: "initial",
    inputs,
  });
}

export const retryCurrentStage = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    if (!isRunnableStage(project.currentStage)) return;

    await ctx.db.patch(projectId, {
      status: "active",
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("owner", SINGLE_USER))
      .order("desc")
      .collect(),
});

export const detail = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(20);

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();

    const resolvedArtifacts: Artifact[] = await Promise.all(
      artifacts.map((a) => resolveArtifact(ctx, a)),
    );

    return {
      project,
      logs,
      artifacts: resolvedArtifacts,
    };
  },
});
