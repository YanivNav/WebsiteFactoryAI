import { isStepCount, Output, ToolLoopAgent, type ToolSet } from "ai";
import type { z } from "zod";
import { resolveModel } from "../llm";

export interface StructuredAgentRequest<T> {
  id: string;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  tools?: ToolSet;
  maxSteps?: number;
}

/** Agent execution is a port so Eve or another durable runtime can replace AI SDK later. */
export interface AgentRuntime {
  runStructured<T>(request: StructuredAgentRequest<T>): Promise<T>;
}

export class AiSdkAgentRuntime implements AgentRuntime {
  async runStructured<T>(request: StructuredAgentRequest<T>): Promise<T> {
    const agent = new ToolLoopAgent({
      id: request.id,
      model: resolveModel(),
      instructions: request.instructions,
      output: Output.object({ schema: request.schema }),
      stopWhen: isStepCount(request.maxSteps ?? 10),
      tools: request.tools ?? {},
    });
    const result = await agent.generate({ prompt: request.prompt });
    return result.output as T;
  }
}
