import { type LanguageModel, Output, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import { loadPrompt, type PromptName } from "../lib/prompts";
import { resolveModel } from "./model";

export interface GenerateObjectRequest<T> {
  model?: LanguageModel;
  instructions: PromptName;
  message: string;
  schema: z.ZodType<T>;
  tools?: ToolSet;
}

export class LLMService {
  async generateObject<T>(request: GenerateObjectRequest<T>): Promise<T> {
    const agent = new ToolLoopAgent({
      model: request.model || resolveModel(process.env.LLM_MODEL ?? "gpt-5"),
      instructions: loadPrompt(request.instructions),
      output: Output.object({ schema: z.object({ result: request.schema }) }),
      tools: request.tools ?? {},
    });
    console.log("Calling LLM to generate an object for " + request.instructions);
    const result = await agent.generate({ prompt: request.message });
    return result.output.result;
  }
}
