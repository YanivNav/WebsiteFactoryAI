/**
 * All filesystem and shell access goes through here. No stage handler may touch
 * `fs` or spawn a process directly.
 *
 * This is what makes "runs on a laptop" and "runs in a container" a deploy target
 * rather than a rewrite:
 *
 *   V1 → LocalWorkspace   (a directory under ./workspaces/<projectId>)
 *   V2 → RemoteWorkspace  (a container volume)
 *
 * Workspaces are WARM, not re-cloned per stage. `materialize()` reuses an existing
 * checkout when HEAD already matches; node_modules persists across stages and change
 * requests. Re-cloning is the *recovery* path, not the hot path — you pay for
 * crash-safety only when you actually crash.
 *
 * And a lost workspace is a lost *cache*, not a lost project: it is regenerated from
 * the approved specification + design, which live in Convex. Convex holds the truth;
 * the repository is derived state.
 */

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface Workspace {
  readonly root: string;

  /** Reuse the checkout if HEAD matches; otherwise clone or scaffold it. */
  materialize(projectId: string): Promise<void>;

  exec(cmd: string, args: string[]): Promise<ExecResult>;

  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  glob(pattern: string): Promise<string[]>;

  commit(message: string): Promise<string>;

  /** No-op in V1. GitHub is a backup, not a foundation — see PLAN.md. */
  push(): Promise<void>;
}

// TODO(phase-5): LocalWorkspace implements Workspace.
// TODO(v2):      RemoteWorkspace implements Workspace.
