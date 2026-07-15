import { ProjectDesign, ProjectSpecification } from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import {
  LlmScreenFeedbackClassifier,
  type ScreenFeedbackClassifier,
} from "../services/design-feedback/index.js";
import { StitchDesignGenerator, type DesignGenerator } from "../services/stitch/index.js";
import type { StageHandler } from "./types.js";

let generator: DesignGenerator | undefined;
let feedbackClassifier: ScreenFeedbackClassifier | undefined;

export const generateDesign: StageHandler = {
  stage: "GeneratingDesign",

  async run(ctx) {
    await ctx.log("Designing your site");
    const specificationArtifact = await ctx.store.getLatestApproved(ctx.projectId, "specification");
    if (!specificationArtifact) throw new Error("No approved site plan found");
    const specification = ProjectSpecification.parse(specificationArtifact.data);
    await ctx.log(`Preparing ${specification.pages.length} screen designs`, {
      kind: "design-started",
      total: specification.pages.length,
      screens: specification.pages.map((page) => ({
        pageTitle: page.title,
        pagePath: page.path,
      })),
    });
    const reviewContext = await ctx.store.getLatestReviewContext(ctx.projectId, "design");
    const feedback = reviewContext?.comments ?? [];
    const screenFeedback = feedback.flatMap((item) => {
      try {
        const parsed = JSON.parse(item) as {
          kind?: string;
          screenId?: string;
          pageTitle?: string;
          comment?: string;
        };
        return ["screen-feedback", "screen-revision", "screen-addition"].includes(
          parsed.kind ?? "",
        ) &&
          parsed.screenId &&
          parsed.pageTitle &&
          parsed.comment
          ? [
              {
                screenId: parsed.screenId,
                pageTitle: parsed.pageTitle,
                comment: parsed.comment,
                legacyAction:
                  parsed.kind === "screen-addition"
                    ? ("add" as const)
                    : parsed.kind === "screen-revision"
                      ? ("replace" as const)
                      : undefined,
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
    const previousDesignArtifact = screenFeedback.length > 0 ? reviewContext?.artifact : null;
    const previousDesign = previousDesignArtifact
      ? ProjectDesign.parse(previousDesignArtifact.data)
      : undefined;
    const classificationPromptHashes: string[] = [];
    const screensToRemove: string[] = [];
    const screenRevisions: Array<{
      screenId: string;
      pageTitle: string;
      comment: string;
      action: "replace" | "add" | "regenerate";
      targetPageTitle: string;
      targetPagePath: string;
    }> = [];
    for (const item of screenFeedback) {
      const sourceScreen = previousDesign?.screens.find(
        (screen) => screen.stitchScreenId === item.screenId,
      );
      if (!sourceScreen) throw new Error(`Screen ${item.pageTitle} is no longer available`);
      if (item.legacyAction) {
        screenRevisions.push({
          screenId: item.screenId,
          pageTitle: item.pageTitle,
          comment: item.comment,
          action: item.legacyAction,
          targetPageTitle: sourceScreen.pageTitle,
          targetPagePath: sourceScreen.pagePath,
        });
      } else {
        await ctx.log(`Understanding your feedback for ${item.pageTitle}`);
        feedbackClassifier ??= new LlmScreenFeedbackClassifier();
        const decision = await feedbackClassifier.classify({
          screenId: item.screenId,
          pageTitle: item.pageTitle,
          pagePath: sourceScreen.pagePath,
          comment: item.comment,
          sitePlan: specification,
          screens: previousDesign!.screens.map((screen) => ({
            screenId: screen.stitchScreenId,
            pageTitle: screen.pageTitle,
            pagePath: screen.pagePath,
          })),
        });
        classificationPromptHashes.push(decision.promptHash);
        if (decision.scope === "replan") {
          await ctx.log("Updating the site plan to apply this feedback across the right screens");
          return { kind: "route", next: "GeneratingSpecification" };
        }
        if (decision.operations.length === 0) {
          throw new Error("The design change did not identify any screens to update");
        }
        for (const operation of decision.operations) {
          const operationScreen = previousDesign!.screens.find(
            (screen) => screen.stitchScreenId === operation.screenId,
          );
          if (!operationScreen) {
            throw new Error(`Screen ${operation.pageTitle} is no longer available`);
          }
          if (operation.action === "remove") {
            screensToRemove.push(operation.screenId);
            continue;
          }
          screenRevisions.push({
            screenId: operation.screenId,
            pageTitle: operationScreen.pageTitle,
            comment: operation.instruction,
            action:
              operation.action === "edit"
                ? "replace"
                : operation.action === "regenerate"
                  ? "regenerate"
                  : "add",
            targetPageTitle: operation.pageTitle,
            targetPagePath: operation.pagePath,
          });
        }
      }
    }
    const inputs = { specification, feedback, screenRevisions, viewports: ["desktop"] as const };
    generator ??= new StitchDesignGenerator();
    const screens: Array<{
      pageTitle: string;
      pagePath: string;
      viewport: "desktop";
      stitchScreenId: string;
      htmlStorageId: string;
      screenshotStorageId: string;
    }> = previousDesign
      ? previousDesign.screens
          .filter(
            (screen) =>
              screen.viewport === "desktop" && !screensToRemove.includes(screen.stitchScreenId),
          )
          .map((screen) => ({ ...screen, viewport: "desktop" as const }))
      : [];
    if (screensToRemove.length > 0 && screenRevisions.length === 0 && previousDesign) {
      const design = ProjectDesign.parse({
        stitchProjectId: previousDesign.stitchProjectId,
        screens,
      });
      await ctx.emitArtifact("design", design, {
        promptHash: hashInputs(classificationPromptHashes),
        inputsHash: hashInputs(inputs),
      });
      await ctx.log(`${screens.length} desktop screens ready for review`);
      return { kind: "advance" };
    }
    const generated = await generator.generate(
      { specification, feedback, previousDesign, screenRevisions },
      ctx.log,
      async (screen, index, total) => {
        const [htmlStorageId, screenshotStorageId] = await Promise.all([
          ctx.store.putBlob(screen.html, screen.htmlContentType),
          ctx.store.putBlob(screen.screenshot, screen.screenshotContentType),
        ]);
        const persistedScreen = {
          pageTitle: screen.pageTitle,
          pagePath: screen.pagePath,
          viewport: screen.viewport,
          stitchScreenId: screen.stitchScreenId,
          htmlStorageId,
          screenshotStorageId,
        };
        const replacedIndex = screen.replacesScreenId
          ? screens.findIndex((item) => item.stitchScreenId === screen.replacesScreenId)
          : -1;
        if (replacedIndex >= 0) screens[replacedIndex] = persistedScreen;
        else screens.push(persistedScreen);
        await ctx.log(`${screen.pageTitle} preview ready`, {
          kind: "design-screen-ready",
          pageTitle: screen.pageTitle,
          pagePath: screen.pagePath,
          index: index + 1,
          total,
          screenshotStorageId,
        });
      },
    );
    await ctx.log("Finalizing your design");

    const design = ProjectDesign.parse({ stitchProjectId: generated.stitchProjectId, screens });
    await ctx.emitArtifact("design", design, {
      promptHash:
        classificationPromptHashes.length > 0
          ? hashInputs([generated.promptHash, ...classificationPromptHashes])
          : generated.promptHash,
      inputsHash: hashInputs(inputs),
    });
    await ctx.log(`${screens.length} desktop screens ready for review`);
    return { kind: "advance" };
  },
};
