import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrompt } from "./prompts";

// packages/worker/src/lib → packages/prompts/skills
const SKILLS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../prompts/skills",
);

export interface FactorySkill {
  /** Slug used to load the skill (the file name without extension). */
  name: string;
  /** One-line "when to use this" summary, shown in the skill index. */
  description: string;
  /** The skill body (frontmatter stripped). */
  body: string;
}

let cache: FactorySkill[] | null = null;

/**
 * Factory-authored skills that teach the code agent how the factory wants Wix
 * sites built — policy and gotchas layered on top of Wix's own shipped skills.
 * They live as versioned files in `packages/prompts/skills/`, so a recurring
 * failure is fixed by editing a skill rather than growing the instructions.
 */
export function loadFactorySkills(): FactorySkill[] {
  if (cache) return cache;
  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
  cache = files.map((file) => {
    const raw = readFileSync(path.join(SKILLS_DIR, file), "utf8");
    const { frontmatter, body } = splitFrontmatter(raw);
    return {
      name: frontmatter.name ?? file.replace(/\.md$/, ""),
      description: frontmatter.description ?? "",
      body,
    };
  });
  return cache;
}

export function loadFactorySkill(name: string): FactorySkill | undefined {
  return loadFactorySkills().find((skill) => skill.name === name);
}

/**
 * Install the factory skills as proper Codex skill files under
 * `.agents/skills/<name>/SKILL.md` in the agent home directory.
 *
 * Codex loads skills from this directory structure (same pattern Wix's own
 * `wix skills add` uses). Each skill is a self-contained SKILL.md with
 * YAML frontmatter so Codex indexes and loads them on demand.
 *
 * The AGENTS.md is kept as the global operating instructions (code.md),
 * referencing the skills the agent should read.
 */
export function buildAgentHomeFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  files["AGENTS.md"] = loadPrompt("code");
  for (const skill of loadFactorySkills()) {
    const dir = `.agents/skills/${skill.name}`;
    // Reconstruct full SKILL.md with frontmatter.
    const frontmatter = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n`;
    files[`${dir}/SKILL.md`] = frontmatter + "\n" + skill.body;
  }
  return files;
}

/** Minimal `--- key: value ---` frontmatter parser (no YAML dependency). */
function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) frontmatter[kv[1]!] = kv[2]!.trim();
  }
  return { frontmatter, body: match[2]!.trim() };
}
