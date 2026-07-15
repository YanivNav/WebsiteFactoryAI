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
import { LlmSpecGenerator, type SpecGenerator, type SpecInput } from "../services/spec/index.js";
import { ClarifyingAnswerSet, ProjectSpecification } from "@factory/shared";
import type { StageHandler } from "./types.js";

// Lazy, so a missing API key only breaks the stage that needs it — not the whole
// worker on boot, which would take the other six stages down with it.
let generator: SpecGenerator | undefined;
function specGenerator(): SpecGenerator {
  generator ??= new LlmSpecGenerator();
  return generator;
}

export const generateSpecification: StageHandler = {
  stage: "GeneratingSpecification",

  async run(ctx) {
    await ctx.log("Planning your site");

    // Resolve the inputs EXPLICITLY, in one place, before doing anything.
    //
    // This object is the stage's whole world. Everything the specification depends on
    // appears here and nowhere else — which is what makes the stage rerunnable, and
    // what makes `inputsHash` mean something. Reaching around this for "just one more
    // bit of context" is exactly how determinism dies.
    const answerArtifact = await ctx.store.getLatestArtifact(ctx.projectId, "answers");
    const answers = answerArtifact ? ClarifyingAnswerSet.parse(answerArtifact.data).answers : [];
    const designFeedback = (await ctx.store.getLatestReviewComments(ctx.projectId, "design")).map(
      (item) => {
        try {
          const parsed = JSON.parse(item) as {
            kind?: string;
            pageTitle?: string;
            comment?: string;
          };
          return parsed.kind === "screen-feedback" && parsed.comment
            ? `Feedback given while viewing ${parsed.pageTitle ?? "a design screen"}: ${parsed.comment}`
            : item;
        } catch {
          return item;
        }
      },
    );
    const previousSpecificationArtifact = await ctx.store.getLatestApproved(
      ctx.projectId,
      "specification",
    );
    const previousSpecification = previousSpecificationArtifact
      ? ProjectSpecification.parse(previousSpecificationArtifact.data)
      : undefined;
    const inputs: SpecInput = { brief: ctx.brief, answers, designFeedback, previousSpecification };

    const { specification, promptHash } = await specGenerator().generate(inputs);

    // Append-only: this always creates a new version, never mutates an old one.
    // Emitting a `specification` also opens the review gate for it, which is what
    // parks the project at WaitingForSpecificationApproval on the next transition.
    await ctx.emitArtifact("specification", specification, {
      promptHash,
      inputsHash: hashInputs(inputs),
    });

    await ctx.log("Site plan ready for review");
    return { kind: "advance" };
  },
};
