
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// packages/worker/src/lib → packages/prompts
const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../prompts");

export type PromptName =
  | "questions"
  | "requirements"
  | "wix-research"
  | "wix-architecture"
  | "spec"
  | "design"
  | "screen-change"
  | "wix-setup"
  | "code"
  | "build-task"
  | "fix"
  | "qa-repair"
  | "site-agents";


const cache = new Map<PromptName, string>();

export function loadPrompt(name: PromptName): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const text = readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
  cache.set(name, text);
  return text;
}