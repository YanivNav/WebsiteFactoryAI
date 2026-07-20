import {
  WORK_DEFINITIONS,
  type Artifact,
  type ArtifactType,
  type Asset,
  type WorkOperation,
} from "@factory/shared";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type WorkDraft = {
  phase: Doc<"works">["phase"];
  label: string;
  instruction: Doc<"works">["instruction"];
};

export async function insertWork(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  work: WorkDraft,
  status: "queued",
) {
  validateInstructionContract(work.instruction, "ready");
  const inputs = Object.values(work.instruction.inputs) as Array<{
    artifactId: Id<"artifacts">;
    artifactType: ArtifactType;
  }>;
  for (const input of inputs) {
    const artifact = await ctx.db.get(input.artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      throw new Error("Work input does not belong to this project");
    }
    if (artifact.type !== input.artifactType) {
      throw new Error("Work input has the wrong artifact type");
    }
  }

  if (work.instruction.revision?.baseArtifactId) {
    const base = await ctx.db.get(work.instruction.revision.baseArtifactId);
    if (!base || base.projectId !== projectId) {
      throw new Error("Work revision base does not belong to this project");
    }
  }

  return ctx.db.insert("works", {
    projectId,
    phase: work.phase,
    label: work.label,
    instruction: work.instruction,
    status,
    attempt: 1,
    outputArtifactIds: [],
  });
}

export function validateInstructionContract(
  instruction: {
    type: string;
    inputs: Record<string, { source: string; artifactType: ArtifactType }>;
  },
  state: "ready" | "continuation",
) {
  const definition = WORK_DEFINITIONS[instruction.type as WorkOperation];
  if (!definition) throw new Error(`Unknown work operation: ${instruction.type}`);

  const expectedInputs = definition.inputs as Record<string, ArtifactType>;
  const expectedNames = Object.keys(expectedInputs).toSorted();
  const actualNames = Object.keys(instruction.inputs).toSorted();
  if (
    expectedNames.length !== actualNames.length ||
    expectedNames.some((name, index) => name !== actualNames[index])
  ) {
    throw new Error(`Invalid inputs for work operation: ${instruction.type}`);
  }

  let pendingResults = 0;
  for (const [name, input] of Object.entries(instruction.inputs)) {
    if (input.artifactType !== expectedInputs[name]) {
      throw new Error(`Invalid ${name} input for work operation: ${instruction.type}`);
    }
    if (input.source === "userTaskResult") pendingResults += 1;
  }

  const expectedPendingResults = state === "continuation" ? 1 : 0;
  if (pendingResults !== expectedPendingResults) {
    throw new Error(
      state === "continuation"
        ? "A continuation must expect exactly one user task result"
        : "Queued work cannot contain a pending user task result",
    );
  }
}

export async function insertArtifact(
  ctx: MutationCtx,
  input: {
    projectId: Id<"projects">;
    type: ArtifactType;
    data: unknown;
    basedOnArtifactId?: Id<"artifacts">;
    createdByWorkId?: Id<"works">;
    createdByUserTaskId?: Id<"userTasks">;
    outputKey?: string;
    assets?: { id: string; data: unknown; storageId: Id<"_storage"> }[];
  },
) {
  if (input.basedOnArtifactId) {
    const base = await ctx.db.get(input.basedOnArtifactId);
    if (!base || base.projectId !== input.projectId || base.type !== input.type) {
      throw new Error("The base artifact is invalid");
    }
  }

  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_project_and_type", (q) =>
      q.eq("projectId", input.projectId).eq("type", input.type),
    )
    .collect();

  const { assets, ...rest } = input;
  return ctx.db.insert("artifacts", {
    ...rest,
    version: artifacts.length + 1,
    assets: assets ?? [],
  });
}

export async function resolveArtifact(
  ctx: QueryCtx | MutationCtx,
  artifact: Doc<"artifacts">,
): Promise<Artifact> {
  return {
    id: artifact._id,
    type: artifact.type,
    data: artifact.data,
    version: artifact.version,
    basedOnArtifactId: artifact.basedOnArtifactId,
    createdByWorkId: artifact.createdByWorkId,
    createdByUserTaskId: artifact.createdByUserTaskId,
    assets: await resolveAssets(ctx, artifact.assets),
  } as Artifact;
}

async function resolveAssets(
  ctx: QueryCtx | MutationCtx,
  assets: Doc<"artifacts">["assets"],
): Promise<Asset[]> {
  const urls = new Map(
    await Promise.all(
      [...new Set(assets.map((asset) => asset.storageId))].map(
        async (storageId) => [storageId, await ctx.storage.getUrl(storageId)] as const,
      ),
    ),
  );

  return assets.map((asset) => ({
    id: asset.id,
    data: asset.data,
    url: urls.get(asset.storageId) ?? null,
  }));
}
