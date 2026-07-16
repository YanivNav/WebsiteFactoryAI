/**
 * Brief → structured specification.
 *
 * PHASE 3. This stage is REAL — it is the first one that is. The fake is gone.
 *
 * The user never sees this as JSON. The dashboard renders it as a friendly summary in
 * Wix vocabulary — pages, sections, and features they already understand (Store,
 * Bookings, Blog, CRM). That rendering is Phase 2 work; the data is right regardless.
 */

import { hashInputs } from "../lib/hash.js";
import { LlmSpecGenerator, type SpecGenerator, type SpecInput } from "../services/spec";
import { ClarifyingAnswerSet, parseProjectSpecification } from "@factory/shared";
import { SmartPlanningService } from "../services/planning";
import type { StageHandler } from "./types.js";

// Lazy, so a missing API key only breaks the stage that needs it — not the whole
// worker on boot, which would take the other six stages down with it.
let generator: SpecGenerator | undefined;
let planningService: SmartPlanningService | undefined;
function specGenerator(): SpecGenerator {
  generator ??= new LlmSpecGenerator();
  return generator;
}

export const generateSpecification: StageHandler = {
  stage: "GeneratingSpecification",

  async run(ctx) {
    await ctx.progress(8, "Reviewing your project details");

    // Resolve the inputs EXPLICITLY, in one place, before doing anything.
    //
    // This object is the stage's whole world. Everything the specification depends on
    // appears here and nowhere else — which is what makes the stage rerunnable, and
    // what makes `inputsHash` mean something. Reaching around this for "just one more
    // bit of context" is exactly how determinism dies.
    const answerArtifact = await ctx.store.getLatestArtifact(ctx.projectId, "answers");
    const planningCycle = ctx.planningCycle ?? 1;
    const answers =
      answerArtifact && (answerArtifact.planningCycle ?? 1) === planningCycle
        ? ClarifyingAnswerSet.parse(answerArtifact.data).answers
        : [];
    const designFeedback = (await ctx.store.getLatestReviewFeedback(ctx.projectId, "design")).map(
      (item) =>
        item.screen
          ? `Feedback given while viewing ${item.screen.pageTitle}: ${item.comment}`
          : item.comment,
    );
    const specificationFeedback = (
      await ctx.store.getLatestReviewFeedback(ctx.projectId, "specification")
    ).map((item) => item.comment);
    const previousSpecificationArtifact = await ctx.store.getLatestApproved(
      ctx.projectId,
      "specification",
    );
    const previousSpecification =
      previousSpecificationArtifact &&
      (previousSpecificationArtifact.planningCycle ?? 1) === planningCycle
        ? parseProjectSpecification(previousSpecificationArtifact.data)
        : undefined;
    planningService ??= new SmartPlanningService();
    await ctx.progress(20, "Turning your answers into business requirements");
    const requirementsResult = await planningService.generateRequirements({
      brief: ctx.brief,
      answers,
      designFeedback,
      specificationFeedback,
    });
    await ctx.emitArtifact("businessRequirements", requirementsResult.value, {
      promptHash: requirementsResult.promptHash,
      inputsHash: hashInputs({
        brief: ctx.brief,
        answers,
        designFeedback,
        specificationFeedback,
      }),
    });

    await ctx.progress(38, "Researching the right Wix capabilities");
    const capabilityResult = await planningService.researchCapabilities(requirementsResult.value);
    await ctx.emitArtifact("wixCapabilitySnapshot", capabilityResult.value, {
      promptHash: capabilityResult.promptHash,
      // The retrieved official evidence is an explicit input to every later decision.
      inputsHash: hashInputs({
        requirements: requirementsResult.value,
        evidence: capabilityResult.value.capabilities.flatMap((item) => item.evidence),
      }),
    });

    await ctx.progress(58, "Designing the Wix solution architecture");
    const architectureResult = await planningService.designArchitecture(
      requirementsResult.value,
      capabilityResult.value,
    );
    await ctx.emitArtifact("wixSolutionArchitecture", architectureResult.value, {
      promptHash: architectureResult.promptHash,
      inputsHash: hashInputs({
        requirements: requirementsResult.value,
        capabilities: capabilityResult.value,
      }),
    });

    const inputs: SpecInput = {
      brief: ctx.brief,
      answers,
      designFeedback,
      specificationFeedback,
      previousSpecification,
      businessRequirements: requirementsResult.value,
      wixCapabilities: capabilityResult.value,
      wixArchitecture: architectureResult.value,
    };

    await ctx.progress(
      72,
      previousSpecification ? "Revising your site plan" : "Planning your site",
    );
    const { specification, promptHash } = await specGenerator().generate(inputs);

    // Append-only: this always creates a new version, never mutates an old one.
    // Emitting a `specification` also opens the review gate for it, which is what
    // parks the project at WaitingForSpecificationApproval on the next transition.
    await ctx.emitArtifact("specification", specification, {
      promptHash,
      inputsHash: hashInputs(inputs),
    });
    if (designFeedback.length > 0) {
      await ctx.store.consumeLatestReviewFeedback(ctx.projectId, "design");
    }
    if (specificationFeedback.length > 0) {
      await ctx.store.consumeLatestReviewFeedback(ctx.projectId, "specification");
    }

    await ctx.progress(90, "Preparing your site plan for review");
    return { kind: "advance" };
  },
};
