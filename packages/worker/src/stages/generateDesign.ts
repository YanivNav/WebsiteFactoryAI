import {
  ProjectDesign,
  parseProjectSpecification,
  type Design,
  type DesignScreenProgress,
} from "@factory/shared";
import { hashInputs } from "../lib/hash.js";
import {
  LlmScreenFeedbackClassifier,
  type ScreenFeedbackClassifier,
} from "../services/design-feedback";
import { StitchDesignGenerator, type DesignGenerator } from "../services/stitch";
import type { StageHandler } from "./types.js";

let generator: DesignGenerator | undefined;
let feedbackClassifier: ScreenFeedbackClassifier | undefined;

/** A single screen change the classifier resolved from the reviewer's feedback. */
interface ScreenRevision {
  screenId: string;
  pageTitle: string;
  comment: string;
  action: "replace" | "add" | "regenerate";
  targetPageTitle: string;
  targetPagePath: string;
}

export const generateDesign: StageHandler = {
  stage: "GeneratingDesign",

  async run(ctx) {
    await ctx.progress(5, "Preparing your design");
    const specificationArtifact = await ctx.store.getLatestApproved(ctx.projectId, "specification");
    if (!specificationArtifact) throw new Error("No approved site plan found");
    const specification = parseProjectSpecification(specificationArtifact.data);

    // Remove stale rows from an earlier design run before feedback classification or
    // network work begins. The UI must never show old screens as this run's progress.
    await ctx.store.resetDesignProgress(
      ctx.projectId,
      specification.pages.map((page) => ({
        pageTitle: page.title,
        pagePath: page.path,
        status: "queued",
      })),
    );

    // Feedback arrives structured; an item with `screen` targets one design screen.
    const reviewContext = await ctx.store.getLatestReviewContext(ctx.projectId, "design");
    const feedback = reviewContext?.feedback ?? [];
    const screenFeedback = feedback.flatMap((item) =>
      item.screen ? [{ screen: item.screen, comment: item.comment }] : [],
    );
    const feedbackNotes = feedback.map((item) =>
      item.screen ? `On the ${item.screen.pageTitle} screen: ${item.comment}` : item.comment,
    );
    const previousDesign =
      screenFeedback.length > 0 && reviewContext
        ? ProjectDesign.parse(reviewContext.artifact.data)
        : undefined;
    const latestApprovedDesign = await ctx.store.getLatestApproved(ctx.projectId, "design");

    // A plan-only change often adds implementation detail without changing routes or
    // visual structure. Reuse the approved screens exactly when their route set still
    // matches; do not regenerate pixels merely because a new plan version exists.
    if (feedback.length === 0 && latestApprovedDesign) {
      const approvedDesign = ProjectDesign.parse(latestApprovedDesign.data);
      const desktopScreens = approvedDesign.screens.filter(
        (screen) => screen.viewport === "desktop",
      );
      const plannedPaths = new Set(specification.pages.map((page) => page.path));
      const screenPaths = new Set(desktopScreens.map((screen) => screen.pagePath));
      const sameRoutes =
        plannedPaths.size === screenPaths.size &&
        [...plannedPaths].every((path) => screenPaths.has(path));
      if (sameRoutes) {
        await ctx.store.resetDesignProgress(
          ctx.projectId,
          desktopScreens.map((screen) => ({
            pageTitle: screen.pageTitle,
            pagePath: screen.pagePath,
            status: "ready",
            screenshotStorageId: screen.screenshotStorageId,
          })),
        );
        await ctx.progress(90, "Existing designs still match the updated site plan");
        await ctx.emitArtifact("design", approvedDesign, {
          promptHash: "",
          inputsHash: hashInputs({
            specification,
            reusedDesignVersion: latestApprovedDesign.version,
          }),
        });
        return { kind: "advance" };
      }
    }

    // Turn each piece of screen feedback into concrete operations. The classifier may
    // instead decide the feedback changes the site's structure — then we replan.
    const classificationPromptHashes: string[] = [];
    const screensToRemove: string[] = [];
    const screenRevisions: ScreenRevision[] = [];
    for (const [feedbackIndex, item] of screenFeedback.entries()) {
      const sourceScreen = previousDesign?.screens.find(
        (screen) => screen.stitchScreenId === item.screen.screenId,
      );
      if (!sourceScreen) throw new Error(`Screen ${item.screen.pageTitle} is no longer available`);
      await ctx.progress(
        6 + ((feedbackIndex + 1) / Math.max(1, screenFeedback.length)) * 8,
        `Understanding your feedback for ${item.screen.pageTitle}`,
      );
      feedbackClassifier ??= new LlmScreenFeedbackClassifier();
      const decision = await feedbackClassifier.classify({
        screenId: item.screen.screenId,
        pageTitle: item.screen.pageTitle,
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
          action: operation.action === "edit" ? "replace" : operation.action,
          targetPageTitle: operation.pageTitle,
          targetPagePath: operation.pagePath,
        });
      }
    }

    // Screens carried over from the previous design (revised ones get swapped in place).
    const screens: Design["screens"] =
      previousDesign?.screens.filter(
        (screen) =>
          screen.viewport === "desktop" && !screensToRemove.includes(screen.stitchScreenId),
      ) ?? [];

    // Publish the run's plan as real state: one progress row per screen, which the
    // dashboard renders live. Kept screens are already `ready`; work starts `queued`.
    await ctx.store.resetDesignProgress(
      ctx.projectId,
      planProgress(specification, screens, screenRevisions, Boolean(previousDesign)),
    );
    await ctx.progress(10, "Preparing your screen designs");

    const inputs = {
      specification,
      feedback: feedbackNotes,
      screenRevisions,
      viewports: ["desktop"] as const,
    };

    // Removal-only feedback needs no generation: emit the trimmed design directly.
    if (previousDesign && screensToRemove.length > 0 && screenRevisions.length === 0) {
      const design = ProjectDesign.parse({
        stitchProjectId: previousDesign.stitchProjectId,
        screens,
      });
      await ctx.emitArtifact("design", design, {
        promptHash: hashInputs(classificationPromptHashes),
        inputsHash: hashInputs(inputs),
      });
      await ctx.store.consumeLatestReviewFeedback(ctx.projectId, "design");
      await ctx.progress(95, "Preparing your design for review");
      return { kind: "advance" };
    }

    generator ??= new StitchDesignGenerator();
    const generated = await generator.generate(
      { specification, feedback: feedbackNotes, previousDesign, screenRevisions },
      {
        onProgress: (message) => ctx.log(message),
        onScreenStart: async (screen, index, total) => {
          await ctx.store.updateDesignProgress(ctx.projectId, { ...screen, status: "generating" });
          await ctx.progress(
            15 + (index / Math.max(1, total)) * 70,
            `Generating ${screen.pageTitle}`,
          );
        },
        onScreenReady: async (screen, index, total) => {
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
          await ctx.store.updateDesignProgress(ctx.projectId, {
            pageTitle: screen.pageTitle,
            pagePath: screen.pagePath,
            status: "ready",
            screenshotStorageId,
          });
          await ctx.progress(
            15 + ((index + 1) / Math.max(1, total)) * 75,
            `${screen.pageTitle} design ready`,
          );
          await ctx.log(`${screen.pageTitle} preview ready`);
        },
      },
    );
    await ctx.progress(95, "Preparing your design for review");

    const design = ProjectDesign.parse({ stitchProjectId: generated.stitchProjectId, screens });
    await ctx.emitArtifact("design", design, {
      promptHash:
        classificationPromptHashes.length > 0
          ? hashInputs([generated.promptHash, ...classificationPromptHashes])
          : generated.promptHash,
      inputsHash: hashInputs(inputs),
    });
    if (reviewContext) await ctx.store.consumeLatestReviewFeedback(ctx.projectId, "design");
    await ctx.log(`${screens.length} desktop screens ready for review`);
    return { kind: "advance" };
  },
};

/** The run's plan, as progress rows. A revision reuses its target's row (keyed by path). */
function planProgress(
  specification: { pages: Array<{ title: string; path: string }> },
  keptScreens: Design["screens"],
  screenRevisions: ScreenRevision[],
  isRevision: boolean,
): DesignScreenProgress[] {
  if (!isRevision) {
    return specification.pages.map((page) => ({
      pageTitle: page.title,
      pagePath: page.path,
      status: "queued",
    }));
  }
  const revisionsByScreenId = new Map(
    screenRevisions
      .filter((revision) => revision.action !== "add")
      .map((revision) => [revision.screenId, revision]),
  );
  const rows: DesignScreenProgress[] = keptScreens.map((screen) => {
    const revision = revisionsByScreenId.get(screen.stitchScreenId);
    return revision
      ? {
          pageTitle: revision.targetPageTitle,
          pagePath: revision.targetPagePath,
          status: "queued",
          // Keep the outgoing screenshot visible while the replacement generates.
          screenshotStorageId: screen.screenshotStorageId,
        }
      : {
          pageTitle: screen.pageTitle,
          pagePath: screen.pagePath,
          status: "ready",
          screenshotStorageId: screen.screenshotStorageId,
        };
  });
  for (const revision of screenRevisions.filter((item) => item.action === "add")) {
    rows.push({
      pageTitle: revision.targetPageTitle,
      pagePath: revision.targetPagePath,
      status: "queued",
    });
  }
  return rows;
}
