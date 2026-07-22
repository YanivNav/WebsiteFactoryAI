import { ToolLoopAgent, stepCountIs, type ToolSet } from "ai";
import { resolveModel } from "./model";

/**
 * The coding model, `CODE_MODEL` (a `provider:model-id` spec; default an OpenAI
 * coding model). Kept separate from the spec/design model so the code engine's
 * model is config, per PLAN.md.
 */
export function codeModel() {
  return resolveModel(process.env.CODE_MODEL ?? "gpt-5");
}

export interface AgentRunResult {
  /** The model's final free-text message (a summary of what it did). */
  text: string;
  /** Number of tool-loop steps taken. */
  steps: number;
}

/**
 * Run a tool-using agent to completion. The agent loops — calling the provided
 * side-effecting tools — until it stops or hits `maxSteps`. This is the only
 * place the code engine's model runs; keeping it behind this interface lets the
 * runtime be swapped without touching operation logic (AGENTS.md `AgentRuntime`).
 */
export async function runAgent(opts: {
  instructions: string;
  prompt: string;
  tools: ToolSet;
  maxSteps?: number;
}): Promise<AgentRunResult> {
  const agent = new ToolLoopAgent({
    model: codeModel(),
    instructions: opts.instructions,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 60),
  });
  const result = await agent.generate({ prompt: opts.prompt });
  return { text: result.text, steps: result.steps.length };
}
