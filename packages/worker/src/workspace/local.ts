import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as pty from "node-pty";
import type { ExecResult, Workspace } from "./index.js";

const require = createRequire(import.meta.url);

async function preparePtyHelper() {
  if (process.platform === "win32") return;
  const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
  const candidates = [
    path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    path.join(packageRoot, "build", "Release", "spawn-helper"),
  ];
  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await chmod(candidate, 0o755);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }),
  );
}

function safeProjectDirectory(projectId: string) {
  const value = projectId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!value || value.startsWith("-")) return `project-${value.replace(/^-+/, "")}`;
  return value;
}

function globPattern(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped
      .replace(/\*\*/g, "::DOUBLE_STAR::")
      .replace(/\*/g, "[^/]*")
      .replace(/::DOUBLE_STAR::/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
}

export class LocalWorkspace implements Workspace {
  readonly root: string;
  private readonly parent: string;

  constructor(
    projectId: string,
    parent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../workspaces"),
  ) {
    this.parent = parent;
    this.root = path.join(parent, safeProjectDirectory(projectId));
  }

  async materialize(): Promise<void> {
    await mkdir(this.parent, { recursive: true });
  }

  async exec(
    cmd: string,
    args: string[],
    options: { cwd?: "root" | "parent"; env?: Record<string, string>; tty?: boolean } = {},
  ): Promise<ExecResult> {
    const cwd = options.cwd === "parent" ? this.parent : this.root;
    const env = { ...process.env, ...options.env } as Record<string, string>;
    if (options.tty) {
      await preparePtyHelper();
      return await new Promise((resolve, reject) => {
        let output = "";
        try {
          const child = pty.spawn(cmd, args, {
            cwd,
            env,
            cols: 120,
            rows: 30,
            name: "xterm-256color",
          });
          child.onData((data) => (output += data));
          child.onExit(({ exitCode }) => resolve({ stdout: output, stderr: "", exitCode }));
        } catch (error) {
          reject(error);
        }
      });
    }
    return await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        env,
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.stderr.on("data", (chunk) => (stderr += String(chunk)));
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
    });
  }

  private resolve(filePath: string) {
    const destination = path.resolve(this.root, filePath);
    if (destination !== this.root && !destination.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Workspace path escapes the project: ${filePath}`);
    }
    return destination;
  }

  readFile(filePath: string): Promise<string> {
    return readFile(this.resolve(filePath), "utf8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const destination = this.resolve(filePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }

  async glob(pattern: string): Promise<string[]> {
    const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
    const matches = globPattern(pattern);
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(this.root, path.join(entry.parentPath, entry.name)))
      .filter((entry) => matches.test(entry));
  }

  async commit(message: string): Promise<string> {
    const add = await this.exec("git", ["add", "-A"]);
    if (add.exitCode !== 0) throw new Error(add.stderr || "Could not stage generated site files");
    const commit = await this.exec("git", ["commit", "-m", message]);
    if (commit.exitCode !== 0 && !commit.stdout.includes("nothing to commit")) {
      throw new Error(commit.stderr || "Could not commit generated site files");
    }
    const revision = await this.exec("git", ["rev-parse", "HEAD"]);
    if (revision.exitCode !== 0) throw new Error(revision.stderr || "Could not read site revision");
    return revision.stdout.trim();
  }

  async push(): Promise<void> {}
}
