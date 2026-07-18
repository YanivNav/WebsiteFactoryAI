import { Artifact, Asset } from "@factory/shared";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export async function resolveArtifact(
  ctx: QueryCtx | MutationCtx,
  artifact: Doc<"artifacts">,
): Promise<Artifact> {
  return {
    id: artifact._id,
    type: artifact.type,
    data: artifact.data,
    version: artifact.version,
    planningCycle: artifact.planningCycle,
    sourceArtifactId: artifact.sourceArtifactId,
    generationRequestId: artifact.generationRequestId,
    assets: await resolveAssets(ctx, artifact.assets),
  };
}

export async function resolveAssets(
  ctx: QueryCtx | MutationCtx,
  assets: Doc<"artifacts">["assets"],
): Promise<Asset[]> {
  const storageIds = [...new Set(assets.map((a) => a.storageId))];
  const assetUrls: Record<string, string> = Object.fromEntries(
    await Promise.all(
      storageIds.map(async (storageId) => [storageId, await ctx.storage.getUrl(storageId)]),
    ),
  );

  return assets.map((a) => ({
    id: a.id,
    data: a.data,
    url: assetUrls[a.id],
  }));
}
