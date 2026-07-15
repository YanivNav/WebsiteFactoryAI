/**
 * Prompt loading.
 *
 * Prompts are FILES (`packages/prompts/*.md`), never string literals. Two reasons, and
 * the second is the one that matters:
 *
 *   1. You can iterate on them without touching code.
 *   2. They are INPUTS, so they get hashed. An artifact records the `promptHash` of the
 *      prompt that produced it, which is what lets you tell "the model drifted" apart
 *      from "someone edited the prompt underneath me".
 *
 * Prompts are cached in memory, so editing a `.md` needs a worker restart to take
 * effect. `pnpm worker` runs under `tsx watch`, which restarts on change — but it
 * watches `src/`, not `packages/prompts/`. If a prompt edit seems to do nothing,
 * that is why: restart the worker.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./hash.js";

// packages/worker/src/lib → packages/prompts
const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../prompts",
);

export type PromptName = "spec" | "design" | "code" | "fix";

export interface Prompt {
  readonly name: PromptName;
  readonly text: string;
  /** sha256 of the file's contents. Goes onto every artifact this prompt produces. */
  readonly hash: string;
}

const cache = new Map<PromptName, Prompt>();

export function loadPrompt(name: PromptName): Prompt {
  const cached = cache.get(name);
  if (cached) return cached;

  const text = readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
  const prompt: Prompt = { name, text, hash: sha256(text) };
  cache.set(name, prompt);
  return prompt;
}
