import { generateObject } from "ai";
import z from "zod";
import { loadPrompt } from "../../lib/prompts.js";
import { resolveModel } from "../llm";

export interface ScreenFeedbackInput {
  screenId: string;
  pageTitle: string;
  pagePath: string;
  comment: string;
  sitePlan: unknown;
  screens: Array<{ screenId: string; pageTitle: string; pagePath: string }>;
}

export interface ScreenFeedbackDecision {
  scope: "screens" | "replan";
  operations: Array<{
    action: "edit" | "add" | "remove" | "regenerate";
    screenId: string;
    pageTitle: string;
    pagePath: string;
    instruction: string;
  }>;
  promptHash: string;
}

export interface ScreenFeedbackClassifier {
  classify(input: ScreenFeedbackInput): Promise<ScreenFeedbackDecision>;
}

const Decision = z.object({
  scope: z.enum(["screens", "replan"]),
  operations: z.array(
    z.object({
      action: z.enum(["edit", "add", "remove", "regenerate"]),
      screenId: z.string(),
      pageTitle: z.string().min(1),
      pagePath: z.string().startsWith("/"),
      instruction: z.string().min(1),
    }),
  ),
});

export class LlmScreenFeedbackClassifier implements ScreenFeedbackClassifier {
  async classify(input: ScreenFeedbackInput): Promise<ScreenFeedbackDecision> {
    const prompt = loadPrompt("screen-change");
    const { object } = await generateObject({
      model: resolveModel(),
      schema: Decision,
      instructions: prompt.text,
      prompt: [
        `Screen title: ${input.pageTitle}`,
        `Screen path: ${input.pagePath}`,
        `Selected screen ID: ${input.screenId}`,
        `User feedback: ${input.comment}`,
        `Current site plan:\n${JSON.stringify(input.sitePlan, null, 2)}`,
        `Current screens:\n${input.screens.map((screen) => `- ${screen.screenId} | ${screen.pageTitle} | ${screen.pagePath}`).join("\n")}`,
      ].join("\n"),
    });
    return {
      scope: object.scope,
      operations: object.operations,
      promptHash: prompt.hash,
    };
  }
}
