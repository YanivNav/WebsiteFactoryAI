import { generateText, Output } from "ai";
import { ClarifyingQuestionSet, type QuestionSet } from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";
import { resolveModel } from "../llm";

export interface QuestionGenerator {
  generate(brief: string): Promise<{ questions: QuestionSet; promptHash: string }>;
}

export class LlmQuestionGenerator implements QuestionGenerator {
  async generate(brief: string): Promise<{ questions: QuestionSet; promptHash: string }> {
    const prompt = loadPrompt("questions");
    const { output } = await generateText({
      model: resolveModel(),
      output: Output.object({ schema: ClarifyingQuestionSet }),
      instructions: prompt.text,
      prompt: brief,
    });
    return { questions: output, promptHash: prompt.hash };
  }
}
