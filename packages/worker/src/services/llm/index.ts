/**
 * Model resolution. The one place that knows which LLM provider we are talking to.
 *
 * This exists so that switching models is a config change, not a code change:
 *
 *   LLM_MODEL=openai:gpt-5
 *   LLM_MODEL=google:gemini-3-pro
 *   LLM_MODEL=anthropic:claude-sonnet-5
 *
 * Note this is a DIFFERENT axis of swappability from the service interfaces, and both
 * are worth having:
 *
 *   SpecGenerator (the interface)  swaps the STRATEGY — a different way of producing
 *                                  a specification at all.
 *   LLM_MODEL (this file)          swaps the MODEL — same strategy, different brain.
 *
 * Most of the time you want the second one, and it should be free. Now it is.
 *
 * Each provider reads its own key from the environment, so there is no key plumbing
 * here: OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const PROVIDERS = { openai, google, anthropic } as const;

type ProviderName = keyof typeof PROVIDERS;

/**
 * Resolve `LLM_MODEL` (format: `provider:model-id`) into a model.
 *
 * There is deliberately NO default. Model names go stale, and a wrong-but-plausible
 * default fails confusingly rather than loudly — the same class of mistake as a
 * wrong-but-plausible URL. Make the caller state what they want.
 */
export function resolveModel(spec: string | undefined = process.env.LLM_MODEL): LanguageModel {
  if (!spec) {
    throw new Error(
      "LLM_MODEL is not set. Use `provider:model-id`, e.g. `openai:gpt-5`. " +
        `Providers: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }

  const separator = spec.indexOf(":");
  if (separator === -1) {
    throw new Error(`LLM_MODEL must look like "provider:model-id" — got "${spec}".`);
  }

  const providerName = spec.slice(0, separator) as ProviderName;
  const modelId = spec.slice(separator + 1);

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(
      `Unknown LLM provider "${providerName}". Known: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  if (!modelId) {
    throw new Error(`LLM_MODEL is missing a model id after "${providerName}:".`);
  }

  return provider(modelId);
}
