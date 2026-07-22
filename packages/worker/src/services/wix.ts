import { loadTemplateFiles, renderTemplate } from "../lib/templates";
import type { WorkContext } from "../operations/context";
import type { Workspace } from "../workspace";

export interface ScaffoldedWixProject {
  /** The Wix site (metasite) id from wix.config.json, when provisioning succeeded. */
  siteId?: string;
}

/** 25 minutes: the managed scaffold provisions, installs, builds, and publishes. */
const SCAFFOLD_TIMEOUT_MS = 25 * 60 * 1000;

/**
 * The Wix CLI is an Ink app: run normally it mounts an interactive UI whose
 * input hook calls `setRawMode` on stdin, which throws in a headless worker.
 * Setting `AI_AGENT` switches the CLI into **agent mode** — it skips the
 * interactive UI and instead emits newline-delimited JSON events on stdout
 * (`{"event":"logged_in",...}`). This is the same mechanism the official Wix
 * Headless skill's bootstrap uses. `--api-key` / full scaffold flags keep it
 * non-interactive so nothing ever waits for input.
 */
const AGENT_ENV = { AI_AGENT: "website-factory" };

interface AgentEvent {
  event: string;
  [key: string]: unknown;
}

/**
 * Wix Headless provisioning. All commands run through the Workspace; this
 * service never touches the filesystem or spawns processes itself.
 *
 * Auth: `wix login --api-key` (documented for automations/CI) using
 * WIX_API_KEY. Login state is stored per-machine, so one login per worker
 * lifetime is enough.
 */
export class WixService {
  private loggedIn = false;

  async ensureLogin(ctx: WorkContext, workspace: Workspace): Promise<void> {
    if (this.loggedIn) return;
    const apiKey = process.env.WIX_API_KEY;
    if (!apiKey) throw new Error("WIX_API_KEY must be set to provision Wix projects");
    ctx.log("info", "Logging into Wix CLI with API key");
    const result = await workspace.execInParent(
      "npx",
      ["--yes", "@wix/cli@latest", "login", "--api-key", apiKey],
      { env: AGENT_ENV },
    );

    const events = parseAgentEvents(result.stdout);
    if (events.some((e) => e.event === "logged_in" || e.event === "success")) {
      this.loggedIn = true;
      ctx.log("info", "Logged in to Wix");
      return;
    }
    // In agent mode a valid API key logs in directly; anything else (a prompt
    // for interactive login, a CLI error, or a non-zero exit) cannot proceed
    // in a headless worker.
    if (events.some((e) => e.event === "awaiting_user")) {
      throw new Error("Wix login needs interactive sign-in — the API key was rejected or expired");
    }
    throw new Error(`Wix CLI login failed: ${agentError(events) ?? tail(result.stderr || result.stdout)}`);
  }

  /**
   * Wix-managed: `npm create @wix/new headless` runs non-interactively with
   * the folder/business/template flags (documented for scripts and agents).
   * It provisions the Wix business + site, installs dependencies, and runs
   * `git init`. `--no-publish`: creation would otherwise publish the blank
   * starter template, but there is no site to go live with yet — publishing
   * happens in a later stage once the real site is built. `AI_AGENT` is
   * inherited by the CLI it invokes, keeping the whole scaffold in agent mode.
   */
  async scaffoldManaged(
    ctx: WorkContext,
    workspace: Workspace,
    businessName: string,
  ): Promise<ScaffoldedWixProject> {
    ctx.log("info", `Scaffolding Wix-managed headless project: ${workspace.name}`);
    const result = await workspace.execInParent(
      "npm",
      [
        "create",
        "@wix/new@latest",
        "--yes",
        "--",
        "headless",
        "--folder-name",
        workspace.name,
        "--business-name",
        businessName,
        // Bare flag selects the blank starter — the code stage builds the real site.
        "--site-template",
        // Don't publish the empty starter; the real site goes live in a later stage.
        "--no-publish",
      ],
      { timeoutMs: SCAFFOLD_TIMEOUT_MS, env: AGENT_ENV },
    );
    const events = parseAgentEvents(result.stdout);
    if (result.code !== 0) {
      throw new Error(
        `Wix scaffold failed: ${agentError(events) ?? tail(result.stderr || result.stdout)}`,
      );
    }
    // wix.config.json is the authoritative source for the provisioned site id.
    return { siteId: await this.readSiteId(workspace) };
  }

  /**
   * Self-managed: no CLI provisioning exists, so lay down a framework
   * foundation wired to the Wix JavaScript SDK via an OAuth client id. The
   * headless project and OAuth client are created by the user in the Wix
   * dashboard (a pendingSetup step on the review task).
   *
   * The foundation comes from `templates/self-managed/` — self-managed works
   * with any framework, so changing the framework means changing the template
   * (or adding one), not this service.
   */
  async scaffoldSelfManaged(
    ctx: WorkContext,
    workspace: Workspace,
    businessName: string,
  ): Promise<void> {
    ctx.log("info", `Scaffolding self-managed headless foundation: ${workspace.name}`);
    const vars = { name: workspace.name, businessName };
    for (const file of loadTemplateFiles("self-managed")) {
      await workspace.writeFile(file.path, renderTemplate(file.content, vars));
    }
  }

  private async readSiteId(workspace: Workspace): Promise<string | undefined> {
    if (!(await workspace.hasFile("wix.config.json"))) return undefined;
    try {
      const config = JSON.parse(await workspace.readFile("wix.config.json"));
      return typeof config.siteId === "string" ? config.siteId : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Parse the CLI's agent-mode output: newline-delimited JSON objects with an `event` field. */
function parseAgentEvents(output: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.includes('"event"')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.event === "string") events.push(parsed);
    } catch {
      // Not an event line — ignore chatter.
    }
  }
  return events;
}

/** A human-readable message from a failure event, when one is present. */
function agentError(events: AgentEvent[]): string | undefined {
  const failure = events.find(
    (e) => e.event === "login_failed" || e.event === "cli_unreachable" || e.event === "error",
  );
  if (!failure) return undefined;
  const detail = failure.message ?? failure.error ?? failure.detail;
  return typeof detail === "string" ? detail : failure.event;
}

function tail(text: string, chars = 800): string {
  return text.length > chars ? text.slice(-chars) : text;
}
