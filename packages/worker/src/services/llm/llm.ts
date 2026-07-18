import {type LanguageModel, Output, ToolLoopAgent, type ToolSet} from "ai";
import {z} from 'zod';
import {deepseek} from "@ai-sdk/deepseek";
import {anthropic} from "@ai-sdk/anthropic";
import {openai} from "@ai-sdk/openai";

const providers = {
  openai, anthropic, deepseek
} as const;

type ProviderName = keyof typeof providers;

export interface GenerateObjectRequest<T> {
  model?: LanguageModel;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  tools?: ToolSet;
}

export class LLMService {
  async generateObject<T>(request: GenerateObjectRequest<T>): Promise<T> {
    const agent = new ToolLoopAgent({
      model: request.model || openai('gpt-5'),
      instructions: request.instructions,
      output: Output.object({schema: z.object({result: request.schema})}),
      tools: request.tools ?? {},

    });
    console.log('Running LLM agent to generate object');
    const result = await agent.generate({prompt: request.prompt});
    return result.output.result;
  }
}