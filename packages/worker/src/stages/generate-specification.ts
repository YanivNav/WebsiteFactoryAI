import type { StageHandler } from "./types";
import { LLMService } from "../services/llm";
import { z } from "zod";
import { QuestionSchema, SpecificationSchema } from "@factory/shared";

let llm: LLMService;

// OpenAI Structured Outputs accepts nested `anyOf`, but not the `oneOf` emitted by
// Zod's discriminatedUnion. A regular union preserves validation and emits `anyOf`.
const SpecOutcomeSchema = z.union([
  z.object({
    status: z.literal("ready"),
    specification: SpecificationSchema,
  }),
  z.object({
    status: z.literal("needMoreInfo"),
    reason: z.string().describe("Briefly, what essential information is missing to plan the site"),
  }),
]);

export const generateSpecification: StageHandler = {
  stage: "GeneratingSpecification",
  async run(ctx) {
    if (
      ctx.project.generationRequest &&
      ctx.project.generationRequest.outputType !== "specification"
    ) {
      throw new Error("The queued request does not produce a site plan");
    }
    ctx.progress(0, "Reviewing your answers");
    const [brief, questions, previousSpecification] = await Promise.all([
      ctx.getInputArtifact("brief"),
      ctx.getInputArtifact("questions"),
      ctx.getGenerationBase("specification"),
    ]);

    llm ??= new LLMService();
    ctx.progress(15, "Defining the pages, content, and Wix features");

    const qa = questions?.data.length
      ? questions.data
          .map((q) => `${q.id}. ${q.prompt}\n   → ${q.answer || "no answer"}`)
          .join("\n")
      : "No questions were asked.";

    const revisingSpecification =
      ctx.project.generationRequest?.outputType === "specification" && previousSpecification;
    const revisionContext = revisingSpecification
      ? `\n\nPrevious site specification (version ${previousSpecification.version}):\n${JSON.stringify(previousSpecification.data, null, 2)}\n\n` +
        (ctx.project.generationRequest?.feedback
          ? `Requested change:\n${ctx.project.generationRequest.feedback}\n\nRevise the previous specification to satisfy this request. Preserve every page, workflow, and decision that the request does not explicitly change.`
          : "Create a fresh alternative based on the previous specification. Preserve requirements from the brief and answers, and do not silently remove existing scope.")
      : "";

    const outcome = await llm.generateObject({
      instructions: "spec",
      message:
        `Website Brief:\n${brief?.data ?? "No brief provided."}\n\n` +
        `Clarifying questions and the owner's answers:\n${qa}` +
        revisionContext,
      schema: SpecOutcomeSchema,
    });

    if (outcome.status === "needMoreInfo") {
      ctx.progress(60, `A few more details needed: ${outcome.reason}`);

      const result = await llm.generateObject({
        instructions: "questions",
        message: `After processing the previous questions, we need more info because of: ${outcome.reason}.\n
        Website Brief:\n${brief?.data ?? "No brief provided."}\n
        Questions already asked and their answers: \n${
          questions?.data?.length
            ? questions.data
                .map(
                  (question) =>
                    `${question.id}. ${question.prompt}: ${question.answer || "no answer"}`,
                )
                .join("\n")
            : "No questions asked."
        }`,
        schema: z.array(QuestionSchema).max(10),
      });

      const artifact = await ctx.addArtifact(
        "questions",
        [...(questions?.data ?? []), ...result],
        questions?.id,
      );

      return {
        kind: "awaitArtifact",
        target: "WaitingForAnswers",
        artifactId: artifact.id,
        gateKind: "answers",
      };
    }

    const artifact = await ctx.addArtifact("specification", outcome.specification);
    ctx.progress(90, "Finalizing your site plan");
    return {
      kind: "awaitArtifact",
      target: "WaitingForSpecificationApproval",
      artifactId: artifact.id,
      gateKind: "review",
    };
  },
};
