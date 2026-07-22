import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
