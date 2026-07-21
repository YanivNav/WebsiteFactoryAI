import { z } from "zod";
import type { DesignScreen, Specification } from "@factory/shared";
import { LLMService } from "../services/llm";
import { StitchService, type StitchDeviceType } from "../services/stitch";
import type { ArtifactAsset } from "../server";
import { reviewCompletion, type WorkHandler } from "./types";

let llm: LLMService;
let stitch: StitchService;

const ScreenPromptSchema = z.object({
  name: z.string(),
  path: z.string(),
  prompt: z.string(),
  deviceType: z.enum(["DESKTOP", "MOBILE", "TABLET", "AGNOSTIC"]),
});
const ScreenDesignPromptsSchema = z.object({
  screens: z.array(ScreenPromptSchema),
});
type ScreenPrompt = z.infer<typeof ScreenPromptSchema>;

export const generateDesign: WorkHandler<"generateDesign"> = {
  operation: "generateDesign",
  async run(ctx) {
    const specArtifact = await ctx.getInput("specification");
    const spec = specArtifact.data;

    llm ??= new LLMService();
    stitch ??= new StitchService();

    const revision = ctx.work.instruction.revision;
    const previousDesign = await ctx.getRevisionBase("design");
    const previousScreens = previousDesign?.data.screens ?? [];
    const previousByPath = new Map(previousScreens.map((screen) => [screen.path, screen]));

    await ctx.progress(2, "Planning screen designs");

    // A single-screen revision only reworks that screen's prompt; anything else
    // plans the full set (passing the feedback along for full-design revisions).
    const queue: ScreenPrompt[] = revision?.screenPath
      ? [
          await reviseScreenPrompt(
            spec,
            previousByPath.get(revision.screenPath),
            revision.screenPath,
            revision.feedback,
          ),
        ]
      : (
          await llm.generateObject({
            instructions: "design",
            message: JSON.stringify(
              {
                spec,
                previousScreenCount: previousScreens.length,
                requestedChange: revision?.feedback,
              },
              null,
              2,
            ),
            schema: ScreenDesignPromptsSchema,
          })
        ).screens.slice();

    // Screens and assets start from the previous design (minus those being
    // regenerated) and are overwritten as newly generated screens complete.
    const regenerating = new Set(queue.map((screen) => screen.path));
    const previousAssetById = new Map((previousDesign?.assets ?? []).map((a) => [a.id, a]));
    const screenByPath = new Map<string, DesignScreen>();
    const assetById = new Map<string, ArtifactAsset>();
    for (const screen of previousScreens) {
      if (regenerating.has(screen.path)) continue;
      screenByPath.set(screen.path, screen);
      for (const assetId of [screen.htmlAssetId, screen.imageAssetId]) {
        const asset = previousAssetById.get(assetId);
        if (asset) assetById.set(assetId, { id: asset.id, data: asset.data, storageId: asset.storageId });
      }
    }

    // Reuse the existing Stitch project on revision; create a fresh one otherwise.
    const existingStitchId = previousDesign?.data.stitchProjectId;
    if (existingStitchId) {
      stitch.loadProject(existingStitchId);
      await ctx.progress(5, "Reusing the project on Google Stitch", { stitchProjectId: existingStitchId });
    } else {
      const stitchProjectId = await stitch.createProject(ctx);
      await ctx.progress(5, "Created project on Google Stitch", { stitchProjectId });
    }

    // Kept screens need no progress reporting — the detail query seeds them
    // from the revision base artifact directly.
    let done = 0;
    while (queue.length > 0) {
      const screen = queue.shift()!;
      const percent = 5 + Math.round(((done + 1) / (done + 1 + queue.length)) * 85);
      await ctx.progress(percent, `Designing screen: ${screen.name}`);

      const generated = await stitch.generateScreen(
        ctx,
        screen.prompt,
        screen.deviceType as StitchDeviceType,
      );

      // Upload blobs to file storage.
      const [htmlStorageId, imageStorageId] = await Promise.all([
        ctx.uploadBlob(generated.html, generated.htmlContentType),
        ctx.uploadBlob(generated.image, generated.imageContentType),
      ]);

      const htmlAssetId = `html-${screen.path}`;
      const imageAssetId = `image-${screen.path}`;
      assetById.set(htmlAssetId, {
        id: htmlAssetId,
        data: { contentType: generated.htmlContentType },
        storageId: htmlStorageId,
      });
      assetById.set(imageAssetId, {
        id: imageAssetId,
        data: { contentType: generated.imageContentType },
        storageId: imageStorageId,
      });
      screenByPath.set(screen.path, {
        name: screen.name,
        path: screen.path,
        deviceType: screen.deviceType === "MOBILE" ? "mobile" : "desktop",
        prompt: screen.prompt,
        htmlAssetId,
        imageAssetId,
      });
      done++;

      // Resolve URLs for the UI to show screens in real time.
      const [imageUrl, htmlUrl] = await Promise.all([
        ctx.getFileUrl(imageStorageId),
        ctx.getFileUrl(htmlStorageId),
      ]);
      await ctx.progress(percent, `Designed screen: ${screen.name}`, {
        completedScreen: { name: screen.name, path: screen.path, imageUrl, htmlUrl },
      });

      // Pick up per-screen revision requests raised while this work is running.
      for (const request of await ctx.claimScreenRevisions()) {
        queue.push(
          await reviseScreenPrompt(
            spec,
            screenByPath.get(request.screenPath) ?? previousByPath.get(request.screenPath),
            request.screenPath,
            request.feedback,
          ),
        );
      }
    }

    const design = await ctx.addArtifact(
      "design",
      "design",
      { screens: [...screenByPath.values()], stitchProjectId: stitch.getProjectId() ?? undefined },
      previousDesign?.id,
      [...assetById.values()],
    );

    await ctx.progress(95, "Finalizing your design");

    return reviewCompletion("generateDesign", design.id);
  },
};

/**
 * Build an updated design prompt for one screen: the previous prompt (when the
 * screen has one) plus the user's feedback, grounded in the page's spec.
 */
async function reviseScreenPrompt(
  spec: Specification,
  previous: DesignScreen | undefined,
  path: string,
  feedback: string | undefined,
): Promise<ScreenPrompt> {
  const page = [spec.homePage, ...spec.pages].find((p) => p.path === path);
  const revised = await llm.generateObject({
    instructions: "screen-change",
    message: JSON.stringify(
      {
        page: page ?? { path },
        header: spec.header,
        footer: spec.footer,
        design: spec.design,
        previousPrompt: previous?.prompt,
        requestedChange: feedback,
      },
      null,
      2,
    ),
    schema: z.object({ prompt: z.string() }),
  });
  return {
    name: previous?.name ?? page?.name ?? path,
    path,
    prompt: revised.prompt,
    deviceType: previous?.deviceType === "mobile" ? "MOBILE" : "DESKTOP",
  };
}
