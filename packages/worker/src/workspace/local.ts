import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BackgroundProcess,
  BackgroundProcessHandlers,
  ExecOptions,
  ExecResult,
  Workspace,
} from ".";

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

/**
 * Prepare the coding agent's global home — config that applies to every project
 * we build (its global instructions), as opposed to a single checkout. Kept in
 * this module so the filesystem stays behind the workspace layer.
 *
 * Factory-owned by default so we never clobber a developer's own `~/.codex`.
 */
export async function ensureAgentHome(files: Record<string, string>): Promise<string> {
  const home = path.resolve(
    process.env.FACTORY_CODEX_HOME ?? path.join(workspacesRoot(), "..", ".codex-home"),
  );
  await mkdir(home, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(home, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
  return home;
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

  spawnBackground(
    command: string,
    args: string[],
    options: Pick<ExecOptions, "env" | "stripPackageManagerEnv" | "cwd">,
    handlers: BackgroundProcessHandlers,
  ): BackgroundProcess {
    const child = spawn(command, args, {
      cwd: path.join(this.root, options.cwd ?? ""),
      env: buildEnv(options),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    streamLines(child.stdout, handlers.onStdout);
    streamLines(child.stderr, handlers.onStderr);
    let done = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (done) return;
      done = true;
      handlers.onExit?.(code, signal);
    };
    child.on("exit", finish);
    // A spawn failure (e.g. command not found) never emits "exit".
    child.on("error", () => finish(null, null));

    let killed = false;
    return {
      kill() {
        if (killed) return;
        killed = true;
        child.kill("SIGTERM");
        // Escalate if it ignores SIGTERM; don't keep the worker alive waiting.
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already gone.
          }
        }, 3000).unref();
      },
    };
  }
}

/** Emit each complete line from a stream, buffering partial trailing lines. */
function streamLines(stream: Readable | null, onLine?: (line: string) => void): void {
  if (!stream || !onLine) return;
  let buffer = "";
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) onLine(line.replace(/\r$/, ""));
  });
  stream.on("end", () => {
    if (buffer.trim()) onLine(buffer.replace(/\r$/, ""));
  });
}

/** Build the child env, optionally stripping the parent package-manager fingerprint. */
function buildEnv(options?: Pick<ExecOptions, "env" | "stripPackageManagerEnv">): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env, ...options?.env };
  if (options?.stripPackageManagerEnv) {
    for (const key of Object.keys(env)) {
      if (/^(npm_|pnpm_)/i.test(key)) delete env[key];
    }
  }
  return env;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildEnv(options),
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
