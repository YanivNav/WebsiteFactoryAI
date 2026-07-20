import { z } from "zod";
import { LLMService } from "../services/llm";
import { StitchService, type StitchDeviceType } from "../services/stitch";
import type { ArtifactAsset } from "../server";
import type { WorkHandler } from "./types";

let llm: LLMService;
let stitch: StitchService;

const ScreenDesignPromptsSchema = z.object({
  screens: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      prompt: z.string(),
      deviceType: z.enum(["DESKTOP", "MOBILE", "TABLET", "AGNOSTIC"]).default("DESKTOP"),
    }),
  ),
});

export const generateDesign: WorkHandler<"generateDesign"> = {
  operation: "generateDesign",
  async run(ctx) {
    const specArtifact = await ctx.getInput("specification");
    const spec = specArtifact.data;

    llm ??= new LLMService();
    stitch ??= new StitchService();

    // Determine which screens to generate: either all pages, or a single screen for revision.
    const revision = ctx.work.instruction.revision;
    const screenPath = revision?.screenPath;
    const previousDesign = await ctx.getRevisionBase("design");

    await ctx.progress(2, "Planning screen designs");

    const designPrompts = await llm.generateObject({
      instructions: "design",
      message: JSON.stringify({ spec, previousScreenCount: previousDesign?.data.screens.length ?? 0 }, null, 2),
      schema: ScreenDesignPromptsSchema,
    });

    const screensToGenerate = screenPath
      ? designPrompts.screens.filter((s) => s.path === screenPath)
      : designPrompts.screens;

    // Start with existing screens from a previous design (if any), replacing any that
    // are being regenerated.
    const existingScreens = previousDesign?.data.screens ?? [];
    const screens = existingScreens.filter(
      (s) => !screensToGenerate.some((gen) => gen.path === s.path),
    );

    await stitch.start(ctx.work.projectTitle);

    const totalScreens = screensToGenerate.length;
    const assets: ArtifactAsset[] = [];

    for (let i = 0; i < screensToGenerate.length; i++) {
      const screen = screensToGenerate[i]!;
      const percent = 5 + Math.round(((i + 1) / totalScreens) * 85);
      await ctx.progress(percent, `Designing screen: ${screen.name}`);

      const generated = await stitch.generateScreen(
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

      assets.push(
        { id: htmlAssetId, data: { contentType: generated.htmlContentType }, storageId: htmlStorageId },
        { id: imageAssetId, data: { contentType: generated.imageContentType }, storageId: imageStorageId },
      );

      screens.push({
        name: screen.name,
        path: screen.path,
        deviceType: screen.deviceType === "MOBILE" ? "mobile" : "desktop",
        htmlAssetId,
        imageAssetId,
      });

      // Resolve URLs for the UI to show screens in real time.
      const [imageUrl, htmlUrl] = await Promise.all([
        ctx.getFileUrl(imageStorageId),
        ctx.getFileUrl(htmlStorageId),
      ]);

      // Report per-screen progress so the UI can update in real time.
      void ctx.progress(percent, `Designed screen: ${screen.name}`, {
        completedScreen: { name: screen.name, path: screen.path, imageUrl, htmlUrl },
      });
    }

    const design = await ctx.addArtifact(
      "design",
      "design",
      { screens },
      previousDesign?.id,
      assets,
    );

    await ctx.progress(95, "Finalizing your design");

    return {
      type: "createUserTask",
      task: {
        phase: ctx.work.phase,
        label: "Review your site design",
        subjectArtifactId: design.id,
        result: { type: "selectVersion" },
      },
    };
  },
};
