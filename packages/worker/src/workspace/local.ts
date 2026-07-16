import { access, chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as pty from "node-pty";
import type { ExecResult, Workspace } from ".";

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

  async materialize(
    _projectId?: string,
    source?: { cloneUrl: string; authorization: string },
  ): Promise<void> {
    await mkdir(this.parent, { recursive: true });
    try {
      await access(this.root);
      return;
    } catch {
      if (!source) return;
    }
    const result = await this.exec("git", ["clone", source!.cloneUrl, path.basename(this.root)], {
      cwd: "parent",
      env: this.gitAuthEnv(source!.authorization),
    });
    if (result.exitCode !== 0) throw new Error(result.stderr || "Could not clone project backup");
  }

  async exec(
    cmd: string,
    args: string[],
    options: {
      cwd?: "root" | "parent";
      env?: Record<string, string>;
      tty?: boolean;
      stdin?: string;
    } = {},
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
      child.stdin.end(options.stdin);
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

  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    const destination = this.resolve(filePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
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

  private gitAuthEnv(authorization: string) {
    return {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0: authorization,
      GIT_TERMINAL_PROMPT: "0",
    };
  }

  async setRemote(url: string): Promise<void> {
    const existing = await this.exec("git", ["remote", "get-url", "origin"]);
    const result =
      existing.exitCode === 0
        ? await this.exec("git", ["remote", "set-url", "origin", url])
        : await this.exec("git", ["remote", "add", "origin", url]);
    if (result.exitCode !== 0)
      throw new Error(result.stderr || "Could not configure GitHub backup");
  }

  async sync(authorization: string): Promise<void> {
    const status = await this.exec("git", ["status", "--porcelain"]);
    if (status.exitCode !== 0) throw new Error(status.stderr || "Could not inspect project files");
    if (status.stdout.trim()) throw new Error("Project files changed before the GitHub sync");
    const fetch = await this.exec("git", ["fetch", "origin", "main"], {
      env: this.gitAuthEnv(authorization),
    });
    if (fetch.exitCode !== 0) {
      const missingRemoteBranch = /couldn't find remote ref main/i.test(fetch.stderr);
      if (missingRemoteBranch) return;
      throw new Error(fetch.stderr || "Could not fetch the GitHub backup");
    }
    const merge = await this.exec("git", ["merge", "--ff-only", "origin/main"]);
    if (merge.exitCode !== 0) {
      throw new Error("The GitHub project changed and could not be fast-forwarded safely");
    }
  }

  async push(authorization: string): Promise<void> {
    const branch = await this.exec("git", ["branch", "--show-current"]);
    if (branch.exitCode !== 0) throw new Error(branch.stderr || "Could not read project branch");
    if (branch.stdout.trim() !== "main") {
      const rename = await this.exec("git", ["branch", "-M", "main"]);
      if (rename.exitCode !== 0) throw new Error(rename.stderr || "Could not prepare main branch");
    }
    const result = await this.exec("git", ["push", "--set-upstream", "origin", "main"], {
      env: this.gitAuthEnv(authorization),
    });
    if (result.exitCode !== 0) {
      if (/non-fast-forward|fetch first|rejected/i.test(result.stderr)) {
        throw new Error(
          "The GitHub project changed while the factory was working; retrying safely",
        );
      }
      throw new Error(result.stderr || "Could not back up the project to GitHub");
    }
  }
}
