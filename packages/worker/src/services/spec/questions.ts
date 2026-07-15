import { generateObject } from "ai";
import { ClarifyingQuestionSet, type QuestionSet } from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";
import { resolveModel } from "../llm/index.js";

export interface QuestionGenerator {
  generate(brief: string): Promise<{ questions: QuestionSet; promptHash: string }>;
}

export class LlmQuestionGenerator implements QuestionGenerator {
  async generate(brief: string): Promise<{ questions: QuestionSet; promptHash: string }> {
    const prompt = loadPrompt("questions");
    const { object } = await generateObject({
      model: resolveModel(),
      schema: ClarifyingQuestionSet,
      instructions: prompt.text,
      prompt: brief,
    });
    return { questions: object, promptHash: prompt.hash };
  }
}
