import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Resolve a model spec written as `provider:model-id` (AGENTS.md convention)
 * to an AI SDK model. A bare `model-id` with no provider defaults to OpenAI.
 * The provider prefix must be stripped before handing the id to the provider —
 * `openai("openai:gpt-5")` would ask OpenAI for a model literally named
 * "openai:gpt-5", which doesn't exist.
 */
export function resolveModel(spec: string): LanguageModel {
  const trimmed = spec.trim();
  const sep = trimmed.indexOf(":");
  const provider = sep >= 0 ? trimmed.slice(0, sep) : "openai";
  const modelId = sep >= 0 ? trimmed.slice(sep + 1) : trimmed;
  switch (provider) {
    case "openai":
      return openai(modelId);
    default:
      throw new Error(`Unsupported model provider "${provider}" in "${spec}" (supported: openai)`);
  }
}
