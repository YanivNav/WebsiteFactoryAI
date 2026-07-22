import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// packages/worker/src/lib → packages/worker/templates
const TEMPLATES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../templates");

export interface TemplateFile {
  /** Path relative to the scaffolded project root (dot-files restored). */
  path: string;
  content: string;
}

/**
 * Read a scaffold template directory tree. A leading `_` on a file name maps
 * to a leading `.` (`_gitignore` → `.gitignore`), so dot-files in templates
 * are never mistaken for real ignore/env files of the factory repo itself.
 */
export function loadTemplateFiles(templateName: string): TemplateFile[] {
  const root = path.join(TEMPLATES_DIR, templateName);
  const files: TemplateFile[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = entry.name.startsWith("_") ? `.${entry.name.slice(1)}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), `${prefix}${target}/`);
      } else {
        files.push({
          path: `${prefix}${target}`,
          content: readFileSync(path.join(dir, entry.name), "utf8"),
        });
      }
    }
  };
  walk(root, "");
  return files;
}

/** Substitute `{{key}}` placeholders. Unknown placeholders are left intact. */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)}}/g, (match, key: string) => vars[key] ?? match);
}
