import type { StageHandler } from "./types";
import { LLMService } from "../services/llm";
import { z } from "zod";
import { QuestionSchema } from "@factory/shared";

let llm: LLMService;

export const generateQuestions: StageHandler = {
  stage: "GeneratingQuestions",
  async run(ctx) {
    if (ctx.project.generationRequest && ctx.project.generationRequest.outputType !== "questions") {
      throw new Error("The queued request does not produce questions");
    }
    ctx.progress(0, "Reviewing your brief");
    const [inputQuestions, generationBase, brief] = await Promise.all([
      ctx.getInputArtifact("questions"),
      ctx.getGenerationBase("questions"),
      ctx.getInputArtifact("brief"),
    ]);
    const currentQuestions = generationBase ?? inputQuestions;

    llm ??= new LLMService();

    ctx.progress(10, "Generating clarifying questions");

    const regeneratingQuestions =
      currentQuestions && ctx.project.generationRequest?.mode !== "initial";

    const result = await llm.generateObject({
      instructions: "questions",
      message: `Website Brief:\n${brief?.data ?? "No brief provided."}\n
      ${regeneratingQuestions ? "Generate a fresh alternative question set. Use the previous questions only as reference; do not append to or repeat them unnecessarily." : "Generate the next useful question set."}
      Previous questions and their answers: \n${
        currentQuestions
          ? currentQuestions.data
              .map(
                (question) =>
                  `${question.id}. ${question.prompt}: ${question.answer || "no answer"}`,
              )
              .join("\n")
          : "No questions asked."
      }`,
      schema: z.array(QuestionSchema).max(10),
    });

    ctx.progress(85, "Preparing your questions");
    const artifact = await ctx.addArtifact("questions", result);
    ctx.log(
      "info",
      result.length ? result.length + " questions ready" : "Your brief has everything we need",
    );
    return {
      kind: "awaitArtifact",
      target: "WaitingForAnswers",
      artifactId: artifact.id,
      gateKind: "answers",
    };
  },
};
