import type { DevLogLine, ServerAccess } from "../server";
import type { BackgroundProcess, Workspace } from "../workspace";

/**
 * The dev server, as a long-lived session decoupled from the work loop.
 *
 * `wix dev` never exits, so it cannot be a work that "completes" — running it
 * inside the lease loop jams the single-threaded worker until it times out. This
 * manager instead spawns it as a background process (behind the Workspace layer),
 * streams its output to Convex live, and tracks one running server per project.
 *
 * The trigger work returns the moment the local URL is detected (or a bound is
 * hit); the server keeps running. The manager is a worker-process singleton — a
 * lost dev server is a cache, not state, so a worker restart simply stops them
 * all and the user starts dev again.
 */

/** How long the trigger work waits for the URL before completing anyway. The
 *  server keeps starting in the background and flips to "running" when it binds. */
const READY_TIMEOUT_MS = 60_000;
/** Flush buffered log lines to Convex on this cadence (chatty servers otherwise
 *  hammer the mutation path). */
const LOG_FLUSH_MS = 400;
const LOG_FLUSH_LINES = 40;

/** The localhost URL the CLI prints once the dev server is serving. */
const LOCAL_URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/\S*)?)/i;

// The CLI colours its output with ANSI escapes even to a pipe, so a printed URL
// arrives as `…/\x1b[39m`. Build the matcher from the ESC char code (no literal
// control byte in source) and strip it — otherwise the reset code rode along on
// the URL and got percent-encoded into "%1B[39m".
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Drop lines that are just the CLI reprinting URLs or other repetitive noise.
 * After the first URL is captured these lines carry no useful signal — they just
 * push real errors and build output out of the visible log window.
 */
const NOISE_RES = [
  // Local/network URL announcements — useful once, noise afterwards.
  /^\s*(Local|Network|Wix):\s+https?:\/\//i,
  // HTTP request log lines from the dev server's access-log output.
  /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S*\s+\d{3}\s/,
  // Connection status re-prints.
  /^\s*(Watching|Ready|Compiled|Compiling)\b/i,
  // Empty or whitespace-only lines.
  /^\s*$/,
  // Pure ANSI escape sequences (nothing left after stripping).
  /^\x1b\[[\d;]*m$/,
];

function isNoise(line: string): boolean {
  return NOISE_RES.some((re) => re.test(line));
}

interface RunningDev {
  child: BackgroundProcess;
  pending: DevLogLine[];
  flushTimer: NodeJS.Timeout;
  /** Set when WE killed it, so its exit is reported as "stopped", not a crash. */
  stopping: boolean;
}

class DevServerManager {
  private server?: ServerAccess;
  private readonly running = new Map<string, RunningDev>();

  /** Wire the store once, from the worker entrypoint. */
  configure(server: ServerAccess): void {
    this.server = server;
  }

  /**
   * Start (or restart) the dev server for a project. Resolves once the URL is
   * detected, the process exits, or a timeout — whichever comes first — so the
   * trigger work never hangs. The server itself keeps running afterwards.
   */
  async start(projectId: string, workerId: string, workspace: Workspace): Promise<void> {
    const server = this.requireServer();
    await this.stop(projectId, workerId);
    await server.startDevSession({ projectId, workerId });

    return new Promise<void>((resolve) => {
      let settled = false;
      let urlReported = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        resolve();
      };

      const record: RunningDev = {
        child: undefined as unknown as BackgroundProcess,
        pending: [],
        flushTimer: setInterval(() => this.flush(projectId, workerId), LOG_FLUSH_MS),
        stopping: false,
      };

      const onLine = (stream: "out" | "err") => (raw: string) => {
        // Keep ANSI escapes out of the stored logs AND out of the captured URL.
        const line = stripAnsi(raw);

        // Detect the URL before noise filtering — the very first URL-announcement
        // line is how we know the server is ready.
        if (!urlReported) {
          const match = line.match(LOCAL_URL_RE);
          if (match) {
            urlReported = true;
            const url = (match[1] ?? match[0]).replace(/[)\]}.,;:'"]+$/, "");
            void server
              .updateDevSession({ projectId, workerId, status: "running", url })
              .catch(() => {});
            done();
          }
        }

        // After the first URL is captured, drop repetitive noise — URL reprints,
        // HTTP access logs, and compilation status lines dominate the output and
        // push useful errors out of view.
        if (isNoise(line)) return;

        record.pending.push({ stream, line });
        if (record.pending.length >= LOG_FLUSH_LINES) this.flush(projectId, workerId);
      };

      const child = workspace.spawnBackground(
        "npx",
        ["--yes", "@wix/cli@latest", "dev"],
        { env: { AI_AGENT: "website-factory" }, stripPackageManagerEnv: true },
        {
          onStdout: onLine("out"),
          onStderr: onLine("err"),
          onExit: (code, signal) => {
            clearInterval(record.flushTimer);
            this.flush(projectId, workerId);
            this.running.delete(projectId);
            // A deliberate stop (we killed it) or a clean exit is "stopped".
            // A null code with no signal means it never started; anything else is
            // a genuine crash worth surfacing.
            const clean = record.stopping || code === 0;
            const exitReason = clean
              ? undefined
              : code === null && signal === null
                ? "The dev server could not start"
                : code !== null
                  ? `The dev server stopped (exit code ${code})`
                  : `The dev server was terminated (${signal})`;
            void server
              .updateDevSession({
                projectId,
                workerId,
                status: clean ? "stopped" : "error",
                ...(exitReason ? { exitReason } : {}),
              })
              .catch(() => {});
            done();
          },
        },
      );
      record.child = child;
      this.running.set(projectId, record);

      // Don't hold the trigger work open indefinitely: once the bound passes we
      // let the work complete. If the URL appears later, streaming flips the
      // session to "running" on its own.
      const readyTimer = setTimeout(done, READY_TIMEOUT_MS);
    });
  }

  /** Stop a project's dev server, if one is running, and mark the session stopped. */
  async stop(projectId: string, workerId: string): Promise<void> {
    const record = this.running.get(projectId);
    if (record) {
      record.stopping = true; // so the child's exit reads as "stopped", not a crash
      clearInterval(record.flushTimer);
      this.flush(projectId, workerId);
      record.child.kill();
      this.running.delete(projectId);
    }
    await this.server
      ?.updateDevSession({ projectId, workerId, status: "stopped" })
      .catch(() => {});
  }

  /** Kill every running dev server — called on worker shutdown. */
  stopAll(): void {
    for (const record of this.running.values()) {
      record.stopping = true;
      clearInterval(record.flushTimer);
      record.child.kill();
    }
    this.running.clear();
  }

  private flush(projectId: string, workerId: string): void {
    const record = this.running.get(projectId);
    if (!record || record.pending.length === 0) return;
    const lines = record.pending.splice(0, record.pending.length);
    void this.requireServer()
      .appendDevLogs({ projectId, workerId, lines })
      .catch(() => {});
  }

  private requireServer(): ServerAccess {
    if (!this.server) throw new Error("DevServerManager was not configured with a store");
    return this.server;
  }
}

let singleton: DevServerManager | undefined;

/** The worker-process-wide dev server manager. */
export function getDevServerManager(): DevServerManager {
  return (singleton ??= new DevServerManager());
}
