import { QuestionnaireSchema } from "@factory/shared";
import { LLMService } from "../services/llm";
import { reviewCompletion, type WorkHandler } from "./types";

let llm: LLMService;

export const generateQuestions: WorkHandler<"generateQuestions"> = {
  operation: "generateQuestions",
  async run(ctx) {
    await ctx.progress(0, "Reviewing your brief");
    const [brief, previousQuestions] = await Promise.all([
      ctx.getInput("brief"),
      ctx.getRevisionBase("questionnaire"),
    ]);
    llm ??= new LLMService();
    await ctx.progress(10, "Generating clarifying questions");

    const questionnaire = await llm.generateObject({
      instructions: "questions",
      message: `Website Brief:\n${brief.data}\n
${
  previousQuestions
    ? `Create an improved alternative to these questions:\n${JSON.stringify(previousQuestions.data, null, 2)}`
    : "Generate the useful questions that still need an answer."
}`,
      schema: QuestionnaireSchema,
    });

    await ctx.progress(85, "Preparing your questions");
    const artifact = await ctx.addArtifact(
      "questionnaire",
      "questionnaire",
      questionnaire,
      previousQuestions?.id,
    );
    ctx.log(
      "info",
      questionnaire.questions.length
        ? `${questionnaire.questions.length} questions ready`
        : "No questions needed",
    );

    return reviewCompletion("generateQuestions", artifact.id);
  },
};
