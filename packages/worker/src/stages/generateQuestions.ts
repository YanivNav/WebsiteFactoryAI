import { hashInputs } from "../lib/hash.js";
import { LlmQuestionGenerator, type QuestionGenerator } from "../services/spec/questions.js";
import type { StageHandler } from "./types.js";

let generator: QuestionGenerator | undefined;

export const generateQuestions: StageHandler = {
  stage: "GeneratingQuestions",
  async run(ctx) {
    await ctx.log("Checking what we still need to know");
    generator ??= new LlmQuestionGenerator();
    const inputs = { brief: ctx.brief };
    const { questions, promptHash } = await generator.generate(ctx.brief);
    await ctx.emitArtifact("questions", questions, { promptHash, inputsHash: hashInputs(inputs) });
    await ctx.log(
      questions.questions.length === 0
        ? "Your brief has everything we need"
        : `${questions.questions.length} quick questions ready`,
    );
    return { kind: "questions", hasQuestions: questions.questions.length > 0 };
  },
};
