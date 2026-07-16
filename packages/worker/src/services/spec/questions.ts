import { isStepCount, Output, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { ClarifyingQuestionSet, type AnswerSet, type QuestionSet } from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";
import { resolveModel } from "../llm";

export interface QuestionInput {
  brief: string;
  answers: AnswerSet["answers"];
  previousQuestions: Array<{
    id: string;
    prompt: string;
  }>;
  round: number;
}

export interface QuestionGenerator {
  generate(input: QuestionInput): Promise<{ questions: QuestionSet; promptHash: string }>;
}

const discoveryAreas = [
  {
    category: "business",
    decisions: "primary business model, website goals, launch scope",
  },
  { category: "audience", decisions: "visitor groups, trust needs, conversion paths" },
  { category: "content", decisions: "content types, ownership, update frequency, migration" },
  { category: "commerce", decisions: "catalog, pricing, checkout, payment and fulfillment" },
  {
    category: "scheduling",
    decisions: "appointments, classes, events, availability and capacity",
  },
  {
    category: "workflows",
    decisions: "dynamic page context, inputs, resulting business actions and success states",
  },
  {
    category: "communications",
    decisions: "lead routing, notifications, triggered emails and team follow-up",
  },
  { category: "accounts", decisions: "login, permissions, subscriptions and restricted content" },
  { category: "operations", decisions: "what staff manage in Wix and where records must appear" },
  { category: "launch", decisions: "languages, locations, existing data and hard constraints" },
] as const;

export class LlmQuestionGenerator implements QuestionGenerator {
  async generate(input: QuestionInput): Promise<{ questions: QuestionSet; promptHash: string }> {
    const prompt = loadPrompt("questions");
    const agent = new ToolLoopAgent({
      id: "requirements-interviewer",
      model: resolveModel(),
      instructions: prompt.text,
      output: Output.object({ schema: ClarifyingQuestionSet }),
      stopWhen: isStepCount(6),
      tools: {
        inspectDiscoveryCoverage: tool({
          description:
            "Review the complete requirements checklist before deciding whether to ask another round.",
          inputSchema: z.object({
            coveredQuestionIds: z.array(z.string()),
            uncertainAreas: z.array(z.string()),
          }),
          execute: async ({ coveredQuestionIds, uncertainAreas }) => ({
            areas: discoveryAreas,
            alreadyAsked: input.previousQuestions,
            answeredQuestionIds: input.answers.map((answer) => answer.questionId),
            claimedCoverage: coveredQuestionIds,
            claimedUncertainty: uncertainAreas,
            finalRound: input.round >= 3,
          }),
        }),
      },
    });
    const result = await agent.generate({
      prompt: [
        `Interview round: ${input.round} of 3.`,
        `Client brief:\n${input.brief}`,
        input.answers.length > 0
          ? `All answers collected so far:\n${input.answers
              .map((answer) => `- ${answer.questionId}: ${answer.value}`)
              .join("\n")}`
          : "Answers collected so far: none.",
        input.previousQuestions.length > 0
          ? `Questions already asked (never repeat them):\n${input.previousQuestions
              .map((question) => `- ${question.id}: ${question.prompt}`)
              .join("\n")}`
          : "Questions already asked: none.",
      ].join("\n\n"),
    });
    return { questions: result.output, promptHash: prompt.hash };
  }
}
