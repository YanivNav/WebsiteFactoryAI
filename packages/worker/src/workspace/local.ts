import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecOptions, ExecResult, Workspace } from ".";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Directories never worth listing/walking. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".astro", ".cache"]);

/**
 * Where per-project checkouts live. `workspaces/` at the repo root (gitignored,
 * disposable — a lost workspace is a lost cache, not lost code), overridable
 * with WORKSPACES_DIR for containers.
 */
export function workspacesRoot(): string {
  if (process.env.WORKSPACES_DIR) return path.resolve(process.env.WORKSPACES_DIR);
  // packages/worker/src/workspace → repo root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "workspaces");
}

export class LocalWorkspace implements Workspace {
  readonly root: string;

  constructor(
    readonly name: string,
    baseDir: string = workspacesRoot(),
  ) {
    this.root = path.join(baseDir, name);
  }

  async exists(): Promise<boolean> {
    try {
      return (await readdir(this.root)).length > 0;
    } catch {
      return false;
    }
  }

  async hasFile(relativePath: string): Promise<boolean> {
    try {
      await access(path.join(this.root, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  readFile(relativePath: string): Promise<string> {
    return readFile(path.join(this.root, relativePath), "utf8");
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const absolute = path.join(this.root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }

  async list(relativeDir: string, options?: { recursive?: boolean }): Promise<string[]> {
    const recursive = options?.recursive ?? true;
    const start = path.join(this.root, relativeDir);
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // Missing directory → empty.
      }
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (recursive) await walk(absolute);
        } else {
          files.push(path.relative(this.root, absolute));
        }
      }
    };
    await walk(start);
    return files;
  }

  async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    return runProcess(command, args, path.join(this.root, options?.cwd ?? ""), options);
  }

  async execOrThrow(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    const result = await this.exec(command, args, options);
    if (result.code !== 0) {
      throw new Error(
        `${command} ${args.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`,
      );
    }
    return result;
  }

  async execInParent(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    const parent = path.dirname(this.root);
    await mkdir(parent, { recursive: true });
    return runProcess(command, args, parent, options);
  }
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  options?: ExecOptions,
): Promise<ExecResult> {
  const env: Record<string, string | undefined> = { ...process.env, ...options?.env };
  if (options?.stripPackageManagerEnv) {
    for (const key of Object.keys(env)) {
      if (/^(npm_|pnpm_)/i.test(key)) delete env[key];
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${options?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    }, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
