export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** Working directory relative to the workspace root ("" = the root itself). */
  cwd?: string;
  /** Extra environment variables for this command only. */
  env?: Record<string, string>;
  /** Kill the command after this many milliseconds. Default 10 minutes. */
  timeoutMs?: number;
  /**
   * Remove the package-manager fingerprint the worker's own runner (pnpm)
   * injects — `npm_config_user_agent`, `npm_execpath`, and the rest of the
   * `npm_*` / `PNPM_*` vars. Without this a spawned `npm`/`npx` sees the
   * inherited `pnpm/...` user agent and tools like the Wix scaffolder reject
   * it ("Unsupported package manager"). Set it for any npm-based subprocess
   * that must run as vanilla npm.
   */
  stripPackageManagerEnv?: boolean;
}

/**
 * The only abstraction allowed to touch the filesystem or spawn processes.
 * Operations and services go through a Workspace; none of them import `fs` or
 * `child_process` directly. V1 is LocalWorkspace; a container-volume
 * RemoteWorkspace can replace it without touching business logic.
 *
 * A workspace instance is scoped to ONE project checkout directory under the
 * workspaces root.
 */
export interface Workspace {
  /** Absolute path of this project's checkout directory. */
  readonly root: string;
  /** Directory name of the checkout under the workspaces root. */
  readonly name: string;

  /** True if the checkout directory exists and is non-empty. */
  exists(): Promise<boolean>;
  /** True if the given path exists inside the checkout. */
  hasFile(relativePath: string): Promise<boolean>;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  /**
   * List file paths (relative to the checkout root) under a directory. Recursive
   * by default, skipping heavy/irrelevant dirs (node_modules, .git, dist, .astro).
   * A missing directory yields an empty list.
   */
  list(relativeDir: string, options?: { recursive?: boolean }): Promise<string[]>;

  /** Run a command inside the checkout (or its parent for scaffolding). */
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  /** Like exec, but throws with stderr when the command fails. */
  execOrThrow(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  /** Run a command in the PARENT directory of the checkout (for scaffolds that create it). */
  execInParent(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export { LocalWorkspace, workspacesRoot } from "./local";
