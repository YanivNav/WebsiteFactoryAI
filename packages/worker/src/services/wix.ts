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

/** A Wix data collection to create (translated from the spec by the caller). */
export interface WixCollectionInput {
  id: string;
  displayName: string;
  fields: Array<{ key: string; displayName: string; type: string }>;
}

/** A media file to import into the Media Manager by URL. */
export interface MediaImport {
  url: string;
  displayName: string;
  mimeType?: string;
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
      { env: AGENT_ENV, stripPackageManagerEnv: true },
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
        'WF: ' + businessName,
        // Bare flag selects the blank starter — the code stage builds the real site.
        "--site-template",
        // Don't publish the empty starter; the real site goes live in a later stage.
        "--no-publish",
      ],
      { timeoutMs: SCAFFOLD_TIMEOUT_MS, env: AGENT_ENV, stripPackageManagerEnv: true },
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

  // ---- Provisioning (REST, admin API key) --------------------------------
  //
  // These edit the site's business setup the way the dashboard would, so most
  // "manual setup" the spec implies is automated. The App Installation API
  // requires the account-level API key (not a client-credentials token) — which
  // is exactly what WIX_API_KEY is.

  /**
   * Install a business-solution app on the project. The account-level API key
   * is the documented identity for this call. Installing an app that's already
   * on the site is treated as success (so re-runs are safe).
   *
   * Note: there is no matching "list installed apps" call for an API key — the
   * Get Installed Apps method is APP-identity only — so we can't pre-check; we
   * just install and tolerate already-installed.
   */
  async installApp(siteId: string, appDefId: string): Promise<void> {
    try {
      await this.rest("POST", "/apps-installer-service/v1/app-instance/install", {
        body: { tenant: { tenantType: "SITE", id: siteId }, appInstance: { appDefId } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Already installed, or a built-in/system app that isn't market-installable
      // (CMS, CRM, Automations…) — both mean "nothing to do here".
      if (/already|installed|\b409\b|APPS_NOT_FOUND_IN_APPS_SERVICE/i.test(message)) return;
      throw error;
    }
  }

  /** Create a CMS data collection. `read: ANYONE`, writes `ADMIN` by default. */
  async createCollection(siteId: string, collection: WixCollectionInput): Promise<void> {
    await this.rest("POST", "/wix-data/v2/collections", {
      siteId,
      body: {
        collection: {
          id: collection.id,
          displayName: collection.displayName,
          fields: collection.fields.map((f) => ({
            key: f.key,
            displayName: f.displayName,
            type: f.type,
          })),
          permissions: { read: "ANYONE", insert: "ADMIN", update: "ADMIN", remove: "ADMIN" },
        },
      },
    });
  }

  /** Bulk-insert seed rows into a collection. */
  async seedItems(siteId: string, collectionId: string, items: Record<string, unknown>[]): Promise<void> {
    if (items.length === 0) return;
    await this.rest("POST", "/wix-data/v2/bulk/items/insert", {
      siteId,
      body: { dataCollectionId: collectionId, dataItems: items.map((data) => ({ data })) },
    });
  }

  /** Import images/logos into the Media Manager from external URLs. */
  async importMedia(siteId: string, files: MediaImport[]): Promise<void> {
    if (files.length === 0) return;
    await this.rest("POST", "/site-media/v1/bulk/files/import-v2", {
      siteId,
      body: {
        importFileRequests: files.map((f) => ({
          url: f.url,
          displayName: f.displayName,
          mimeType: f.mimeType,
        })),
      },
    });
  }

  // ---- Preview & release (CLI, agent mode) -------------------------------

  /** `wix preview` → a shareable preview URL for the built site. */
  async preview(ctx: WorkContext, workspace: Workspace): Promise<string | undefined> {
    ctx.log("info", "Creating a Wix preview");
    const result = await workspace.exec("npx", ["--yes", "@wix/cli@latest", "preview"], {
      env: AGENT_ENV,
      stripPackageManagerEnv: true,
      timeoutMs: SCAFFOLD_TIMEOUT_MS,
    });
    return pickSiteUrl(ctx, parseAgentEvents(result.stdout), result.stdout, "preview");
  }

  /** `wix release` → publishes and returns the live URL. */
  async release(ctx: WorkContext, workspace: Workspace): Promise<string | undefined> {
    ctx.log("info", "Publishing the site with Wix");
    const result = await workspace.exec("npx", ["--yes", "@wix/cli@latest", "release"], {
      env: AGENT_ENV,
      stripPackageManagerEnv: true,
      timeoutMs: SCAFFOLD_TIMEOUT_MS,
    });
    if (result.code !== 0) {
      throw new Error(`Wix release failed: ${agentError(parseAgentEvents(result.stdout)) ?? tail(result.stderr || result.stdout)}`);
    }
    return pickSiteUrl(ctx, parseAgentEvents(result.stdout), result.stdout, "published");
  }

  private async rest<T = unknown>(
    method: "GET" | "POST",
    path: string,
    opts: { siteId?: string; body?: unknown } = {},
  ): Promise<T> {
    const apiKey = process.env.WIX_API_KEY;
    if (!apiKey) throw new Error("WIX_API_KEY must be set to call Wix APIs");
    const headers: Record<string, string> = {
      Authorization: apiKey,
      "Content-Type": "application/json",
    };
    if (opts.siteId) headers["wix-site-id"] = opts.siteId;
    const response = await fetch(`https://www.wixapis.com${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Wix API ${method} ${path} failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    return (await response.json().catch(() => ({}))) as T;
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

// URLs the CLI prints that are never the site itself: the dashboard, docs, and
// account/marketing pages. The dashboard lives at manage.wix.com/dashboard.
const NON_SITE_URL = /manage\.wix\.com|\/dashboard|dev\.wix\.com|support\.wix|www\.wix\.com|wix\.com\/app-market/i;

interface UrlCandidate {
  url: string;
  key?: string;
}

function collectUrls(events: AgentEvent[], output: string): UrlCandidate[] {
  const candidates: UrlCandidate[] = [];
  for (const event of events) {
    for (const [key, value] of Object.entries(event)) {
      if (typeof value !== "string") continue;
      for (const url of value.match(/https?:\/\/[^\s"']+/g) ?? []) candidates.push({ url, key });
    }
  }
  for (const url of output.match(/https?:\/\/[^\s"']+/g) ?? []) candidates.push({ url });
  return candidates;
}

/**
 * Pick the site's preview/published URL from the CLI output. `wix preview` and
 * `wix release` print several links (the dashboard, the preview, the published
 * site); the dashboard is a `manage.wix.com/dashboard` URL and must never be
 * chosen as the site. Ranks the remaining candidates and logs them so a wrong
 * pick is diagnosable. Best-effort — returns nothing rather than a wrong guess.
 */
function pickSiteUrl(
  ctx: WorkContext,
  events: AgentEvent[],
  output: string,
  intent: "preview" | "published",
): string | undefined {
  const candidates = collectUrls(events, output).filter((c) => !NON_SITE_URL.test(c.url));
  if (candidates.length === 0) {
    ctx.log("warn", "No site URL found in Wix CLI output");
    return undefined;
  }
  const intentRe = new RegExp(intent, "i");
  const score = (c: UrlCandidate): number => {
    let s = 0;
    if (c.key && intentRe.test(c.key)) s += 4;
    if (c.key && /(url|site|live|preview|published|domain)/i.test(c.key)) s += 1;
    if (/\.(?:wixsite|wixstudio|editorx)\.com|\.wix\.run/i.test(c.url)) s += 2;
    return s;
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  ctx.log(
    "info",
    `Wix ${intent} URL candidates: ${[...new Set(ranked.map((c) => c.url))].slice(0, 6).join(" | ")}`,
  );
  return ranked[0]?.url;
}

function tail(text: string, chars = 800): string {
  return text.length > chars ? text.slice(-chars) : text;
}
