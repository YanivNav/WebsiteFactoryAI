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
 * A lost local workspace is a lost *cache*: clone the private organization repository,
 * then resume from the approved specification + design in Convex. GitHub holds the code
 * truth because reviewed human edits may not be derivable from Convex inputs.
 */

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface Workspace {
  readonly root: string;

  /** Reuse the checkout if present; otherwise clone the canonical repository. */
  materialize(
    projectId: string,
    source?: { cloneUrl: string; authorization: string },
  ): Promise<void>;

  exec(
    cmd: string,
    args: string[],
    options?: {
      cwd?: "root" | "parent";
      env?: Record<string, string>;
      tty?: boolean;
      stdin?: string;
    },
  ): Promise<ExecResult>;

  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  glob(pattern: string): Promise<string[]>;

  commit(message: string): Promise<string>;

  setRemote(url: string): Promise<void>;
  sync(authorization: string): Promise<void>;

  /** Push factory commits to the private organization repository. Never force-push. */
  push(authorization: string): Promise<void>;
}

export { LocalWorkspace } from "./local.js";
// TODO(v2):      RemoteWorkspace implements Workspace.
