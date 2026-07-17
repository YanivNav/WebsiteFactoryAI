/**
 * Wix — and ONLY Wix.
 *
 * Responsible for the Wix CLI, Wix APIs, and Wix MCP. Never mix Wix logic into
 * Claude logic, or vice versa. If you find yourself writing a prompt in this file,
 * you are in the wrong file.
 *
 * The CLI is fully scriptable, including authentication:
 *
 *   wix login --api-key $WIX_API_KEY   non-interactive; works in a container
 *   npm create @wix/new@latest headless -- --folder-name --business-name --site-template
 *   wix build      build
 *   wix preview    → shareable versioned preview URL
 *   wix release    → publish; returns the live URL
 *   wix env set --key --value
 *
 * Wix-managed headless projects are Astro 5. Wix's Astro integration handles auth
 * and SEO for us.
 *
 */

import type { Specification } from "@factory/shared";
import type { Workspace } from "../../workspace";

export interface WixProject {
  projectId?: string;
  siteId: string;
  appId: string;
}

export interface ProvisionInput {
  projectId: string;
  businessName: string;
  siteTemplate?: "blank" | "commerce" | "scheduler" | "registration";
}

export interface WixService {
  provision(input: ProvisionInput, workspace: Workspace): Promise<WixProject>;
  ensureAppPermissions(
    permissionIds: string[],
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<boolean>;
  prepareSiteResources(
    specification: Specification,
    externalMediaUrls: string[],
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<WixSiteResources>;
  ensureSdkPackages(
    packageNames: string[],
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<void>;
  setEnvironmentVariables(values: Record<string, string>, workspace: Workspace): Promise<void>;
  build(workspace: Workspace): Promise<void>;
  preview(
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<{ url: string }>;
}

export interface WixSiteResources {
  cmsCollections: Array<{ id: string; displayName: string }>;
  formsMode: "wixForms" | "customCrm";
  forms: Array<{
    id: string;
    name: string;
    fields: Array<{ target: string; label: string; required: boolean; identifier: string }>;
  }>;
  media: Array<{ sourceUrl: string; wixUrl: string }>;
}

export class WixAccountConfigurationError extends Error {
  override readonly name = "WixAccountConfigurationError";
}

type CmsCollection = Specification["infrastructure"]["cmsCollections"][number];

const CMS_FIELD_TYPES = {
  text: "TEXT",
  richText: "RICH_TEXT",
  number: "NUMBER",
  boolean: "BOOLEAN",
  date: "DATE",
  image: "IMAGE",
  url: "URL",
  reference: "REFERENCE",
} as const;

function resourceId(value: string) {
  const id = value.replace(/[^a-zA-Z0-9_-]+/g, "");
  if (!id) throw new Error(`Wix resource name is invalid: ${value}`);
  return id;
}

function fieldKey(value: string) {
  const key = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) throw new Error(`Wix CMS field name is invalid: ${value}`);
  return key;
}

function parseConfig(raw: string): WixProject {
  const config = JSON.parse(raw) as {
    projectId?: unknown;
    siteId?: unknown;
    appId?: unknown;
  };
  if (typeof config.siteId !== "string" || typeof config.appId !== "string") {
    throw new Error("Wix created the project but its configuration is missing site details");
  }
  return {
    projectId: typeof config.projectId === "string" ? config.projectId : undefined,
    siteId: config.siteId,
    appId: config.appId,
  };
}

async function existingProject(workspace: Workspace) {
  try {
    return parseConfig(await workspace.readFile("wix.config.json"));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

function commandError(
  result: { stderr: string; stdout: string },
  fallback: string,
  secrets: string[] = [],
) {
  const raw = result.stderr.trim() || result.stdout.trim();
  const redacted = secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), raw);
  const withoutAnsi = redacted.replace(/\u001b\[[0-9;]*m/g, "");
  const markedError = withoutAnsi.includes("✖")
    ? withoutAnsi.slice(withoutAnsi.lastIndexOf("✖") + 1)
    : withoutAnsi;
  const detail = markedError
    .split("----- CLI crash report")[0]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("at "))
    .join(" ")
    .slice(0, 1_000);
  return detail ? `${fallback}: ${detail}` : fallback;
}

const WIX_PREVIEW_ATTEMPTS = 3;
const WIX_PREVIEW_READY_ATTEMPTS = 6;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isWixPreviewHost(hostname: string) {
  return hostname.endsWith(".wix-host.com") || hostname.endsWith(".wix-site-host.com");
}

/** Extract only the deployed Wix preview, never a CLI help, login, or dashboard URL. */
export function extractWixPreviewUrl(output: string) {
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, "");
  const candidates = plainOutput.match(/https:\/\/[^\s<>"']+/g) ?? [];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.;]+$/, "");
    try {
      const url = new URL(cleaned);
      if (url.protocol === "https:" && isWixPreviewHost(url.hostname)) return url.toString();
    } catch {
      // Keep looking: CLI output may contain prose punctuation next to unrelated URLs.
    }
  }
  return null;
}

function isRetryablePreviewFailure(output: string) {
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET|STATE_MISMATCH|temporary system error|temporarily unavailable|try again shortly|socket.*closed|fetch failed/i.test(
    output,
  );
}

async function waitForPreviewToRespond(
  url: string,
  onProgress?: (message: string) => Promise<void>,
  runtime: {
    fetcher?: (input: string, init: RequestInit) => Promise<Response>;
    sleep?: (milliseconds: number) => Promise<unknown>;
    attempts?: number;
  } = {},
) {
  const fetcher = runtime.fetcher ?? fetch;
  const sleep = runtime.sleep ?? wait;
  const attempts = runtime.attempts ?? WIX_PREVIEW_READY_ATTEMPTS;
  let detail = "the preview did not respond";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return;
      detail = `Wix returned ${response.status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) {
      console.error(`[wix] preview is not ready — availability check ${attempt}/${attempts}`);
      await onProgress?.(
        `Waiting for Wix to make the preview available · ${attempt} of ${attempts}`,
      );
      await sleep(Math.min(attempt * 2_000, 8_000));
    }
  }
  throw new Error(`Wix created the preview but it could not be opened: ${detail}`);
}

export async function deployWixPreview(
  workspace: Workspace,
  onProgress?: (message: string) => Promise<void>,
  runtime: {
    fetcher?: (input: string, init: RequestInit) => Promise<Response>;
    sleep?: (milliseconds: number) => Promise<unknown>;
    deploymentAttempts?: number;
    readinessAttempts?: number;
  } = {},
): Promise<{ url: string }> {
  const sleep = runtime.sleep ?? wait;
  const deploymentAttempts = runtime.deploymentAttempts ?? WIX_PREVIEW_ATTEMPTS;
  let lastFailure = "Wix preview failed";
  for (let attempt = 1; attempt <= deploymentAttempts; attempt += 1) {
    console.error(`[wix] creating preview — attempt ${attempt}/${deploymentAttempts}`);
    if (attempt > 1) {
      await onProgress?.(`Retrying Wix preview · ${attempt} of ${deploymentAttempts}`);
    }
    const result = await workspace.exec("wix", ["preview"], { env: { CI: "1" } });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0) {
      const url = extractWixPreviewUrl(output);
      if (!url) throw new Error("Wix created the preview but did not return its Wix-hosted URL");
      console.error(`[wix] preview created — ${new URL(url).hostname}`);
      await onProgress?.("Checking the Wix preview");
      await waitForPreviewToRespond(url, onProgress, {
        fetcher: runtime.fetcher,
        sleep,
        attempts: runtime.readinessAttempts,
      });
      return { url };
    }

    lastFailure = commandError(result, "Wix preview failed");
    if (attempt === deploymentAttempts || !isRetryablePreviewFailure(output)) {
      throw new Error(lastFailure);
    }
    await sleep(attempt * 2_000);
  }
  throw new Error(lastFailure);
}

async function siteToken(workspace: Workspace, siteId: string) {
  const result = await workspace.exec("wix", ["token", "--site", siteId], { env: { CI: "1" } });
  if (result.exitCode !== 0) throw new Error(commandError(result, "Wix access failed"));
  const token = result.stdout.trim().split(/\s+/).at(-1);
  if (!token) throw new Error("Wix did not return a site access token");
  return token;
}

async function wixRequest<T>(
  siteId: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const operation = path.startsWith("/apps-installer-service/")
    ? "checking or installing the required Wix app"
    : path.startsWith("/form-schema-service/")
      ? "preparing Wix Forms"
      : path.startsWith("/wix-data/")
        ? "preparing Wix CMS"
        : path.startsWith("/site-media/")
          ? "importing site media"
          : "preparing the Wix site";
  let response: Response;
  try {
    response = await fetch(`https://www.wixapis.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "wix-site-id": siteId,
        ...init.headers,
      },
    });
  } catch (error) {
    console.error(`[wix] ${method} ${path} — network failure`);
    throw new Error(
      `Wix setup failed while ${operation}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.error(`[wix] ${method} ${path} — ${response.status}`);
  const rawBody = await response.text();
  let body:
    | (T & {
        message?: string;
        error?: string;
        details?: { applicationError?: { description?: string } };
      })
    | null = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Wix occasionally returns a proxy/plain-text error. Preserve it below.
  }
  if (!response.ok) {
    const detail =
      body?.details?.applicationError?.description ??
      body?.message ??
      body?.error ??
      rawBody.trim().slice(0, 500);
    throw new Error(
      detail
        ? `Wix setup failed while ${operation}: ${detail}`
        : `Wix setup failed while ${operation} (${response.status})`,
    );
  }
  return body as T;
}

async function wixAccountRequest<T>(
  apiKey: string,
  accountId: string,
  path: string,
  init: RequestInit = {},
) {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(`https://www.wixapis.com${path}`, {
      ...init,
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "wix-account-id": accountId,
        ...init.headers,
      },
    });
  } catch (error) {
    console.error(`[wix] ${method} app permissions — network failure`);
    throw new Error(
      `Wix setup failed while connecting the required Wix services: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.error(`[wix] ${method} app permissions — ${response.status}`);
  const rawBody = await response.text();
  let body:
    | (T & {
        message?: string;
        error?: string;
        details?: { applicationError?: { description?: string } };
      })
    | null = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Preserve a Wix proxy/plain-text error below.
  }
  if (!response.ok) {
    const detail =
      body?.details?.applicationError?.description ??
      body?.message ??
      body?.error ??
      rawBody.trim().slice(0, 500);
    if (response.status === 401 || response.status === 403) {
      throw new WixAccountConfigurationError(
        "Wix account access is incomplete. In the Wix API Keys Manager, give WIX_API_KEY the Manage Custom Apps permission, copy the Account ID into WIX_ACCOUNT_ID, restart the worker, and retry this step.",
      );
    }
    throw new Error(
      detail
        ? `Wix setup failed while connecting the required Wix services: ${detail}`
        : `Wix setup failed while connecting the required Wix services (${response.status})`,
    );
  }
  return body as T;
}

async function ensureCmsDependencies(workspace: Workspace) {
  const manifest = JSON.parse(await workspace.readFile("package.json")) as {
    dependencies?: Record<string, string>;
  };
  if (manifest.dependencies?.["@wix/data"]) return;
  const install = await workspace.exec("npm", ["install", "@wix/data"]);
  if (install.exitCode !== 0) {
    throw new Error(commandError(install, "Wix CMS dependencies could not be installed"));
  }
}

async function ensureFormDependencies(workspace: Workspace) {
  const manifest = JSON.parse(await workspace.readFile("package.json")) as {
    dependencies?: Record<string, string>;
  };
  if (manifest.dependencies?.["@wix/forms"] && manifest.dependencies?.["@astrojs/react"]) return;
  const install = await workspace.exec("npm", ["install", "@wix/forms", "@astrojs/react"]);
  if (install.exitCode !== 0) {
    throw new Error(commandError(install, "Wix Forms dependencies could not be installed"));
  }
}

async function ensureCrmDependencies(workspace: Workspace) {
  const manifest = JSON.parse(await workspace.readFile("package.json")) as {
    dependencies?: Record<string, string>;
  };
  if (manifest.dependencies?.["@wix/crm"]) return;
  const install = await workspace.exec("npm", ["install", "@wix/crm"]);
  if (install.exitCode !== 0) {
    throw new Error(commandError(install, "Wix CRM dependencies could not be installed"));
  }
}

function referenceTarget(field: CmsCollection["fields"][number], collections: CmsCollection[]) {
  if (field.type !== "reference") return null;
  if (field.referencedCollection) return resourceId(field.referencedCollection);
  const description = field.description?.toLowerCase() ?? "";
  const legacyMatches = collections.filter((collection) =>
    description.includes(collection.name.toLowerCase()),
  );
  if (legacyMatches.length === 1) return resourceId(legacyMatches[0]!.name);
  throw new Error(
    `The ${field.name} CMS reference must name the collection it references in the site plan`,
  );
}

function cmsField(field: CmsCollection["fields"][number], collections: CmsCollection[]) {
  const target = referenceTarget(field, collections);
  return {
    key: fieldKey(field.name),
    displayName: field.name,
    type: CMS_FIELD_TYPES[field.type],
    description: field.description,
    ...(target ? { typeMetadata: { reference: { referencedCollectionId: target } } } : undefined),
  };
}

async function ensureCmsCollections(siteId: string, token: string, collections: CmsCollection[]) {
  if (collections.length === 0) return [];
  const listed = await wixRequest<{
    collections?: Array<{ id?: string; displayName?: string; fields?: Array<{ key?: string }> }>;
    dataCollections?: Array<{
      id?: string;
      displayName?: string;
      fields?: Array<{ key?: string }>;
    }>;
  }>(siteId, token, "/wix-data/v2/collections");
  const existing = listed.collections ?? listed.dataCollections ?? [];
  const resources: WixSiteResources["cmsCollections"] = [];

  // First create every collection without reference fields. Wix requires the target
  // collection to exist before a reference field can be added.
  for (const collection of collections) {
    const id = resourceId(collection.name);
    const found = existing.find((item) => item.id === id || item.displayName === collection.name);
    if (!found) {
      await wixRequest(siteId, token, "/wix-data/v2/collections", {
        method: "POST",
        body: JSON.stringify({
          collection: {
            id,
            displayName: collection.name,
            fields: collection.fields
              .filter((field) => field.type !== "reference")
              .map((field) => cmsField(field, collections)),
            permissions: { insert: "ADMIN", update: "ADMIN", remove: "ADMIN", read: "ANYONE" },
          },
        }),
      });
    }
    resources.push({ id, displayName: collection.name });
  }

  // Then reconcile all fields, including references with their required metadata.
  for (const collection of collections) {
    const id = resourceId(collection.name);
    const current = await wixRequest<{
      collection?: { fields?: Array<{ key?: string }> };
      dataCollection?: { fields?: Array<{ key?: string }> };
    }>(siteId, token, `/wix-data/v2/collections/${encodeURIComponent(id)}`);
    const fields = current.collection?.fields ?? current.dataCollection?.fields ?? [];
    for (const field of collection.fields) {
      if (fields.some((item) => item.key === fieldKey(field.name))) continue;
      await wixRequest(siteId, token, "/wix-data/v2/collections/create-field", {
        method: "POST",
        body: JSON.stringify({ dataCollectionId: id, field: cmsField(field, collections) }),
      });
    }
  }
  return resources;
}

async function importMedia(siteId: string, token: string, urls: string[]) {
  const resources: WixSiteResources["media"] = [];
  for (const [index, sourceUrl] of [...new Set(urls)].entries()) {
    const imported = await wixRequest<{ file?: { url?: string } }>(
      siteId,
      token,
      "/site-media/v1/files/import",
      {
        method: "POST",
        body: JSON.stringify({
          url: sourceUrl,
          displayName: `website-factory-design-${index + 1}.jpg`,
        }),
      },
    );
    if (!imported.file?.url)
      throw new Error("Wix imported a design image without returning its URL");
    resources.push({ sourceUrl, wixUrl: imported.file.url });
  }
  return resources;
}

function wixAdminHeaders() {
  const apiKey = process.env.WIX_API_KEY;
  if (!apiKey) throw new Error("WIX_API_KEY is not configured");
  return { Authorization: apiKey };
}

interface WixFormRecord {
  id?: string;
  _id?: string;
  name?: string;
  revision?: string;
  formFields?: Array<{
    identifier?: string;
    fieldType?: string;
    hidden?: boolean;
    inputOptions?: {
      target?: string;
      required?: boolean;
      stringOptions?: { textInputOptions?: { label?: string } };
    };
  }>;
  postSubmissionTriggers?: { upsertContact?: unknown };
}

function formResource(form: WixFormRecord): WixSiteResources["forms"][number] {
  const id = form.id ?? form._id;
  if (!id) throw new Error("Wix returned a form without an ID");
  return {
    id,
    name: form.name ?? "Website requests",
    fields: (form.formFields ?? [])
      .filter((field) => field.fieldType === "INPUT" && !field.hidden && field.inputOptions?.target)
      .map((field) => ({
        target: field.inputOptions!.target!,
        label: field.inputOptions?.stringOptions?.textInputOptions?.label ?? "Field",
        required: field.inputOptions?.required ?? false,
        identifier: field.identifier ?? "TEXT_INPUT",
      })),
  };
}

async function ensureForms(siteId: string, token: string, enabled: boolean) {
  if (!enabled) return [];
  const adminHeaders = wixAdminHeaders();
  let listed: { forms?: WixFormRecord[] } | undefined;
  let lastError: unknown;
  // Wix Forms namespace activation can lag briefly behind app installation.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      listed = await wixRequest<{ forms?: WixFormRecord[] }>(
        siteId,
        token,
        "/form-schema-service/v4/forms?namespace=wix.form_app.form",
        { headers: adminHeaders },
      );
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  if (!listed) throw lastError;
  const form = listed.forms?.find((item) => item.name === "Website requests");
  if (!form) return [];
  const id = form.id ?? form._id;
  if (!id) throw new Error("Wix returned a form without an ID");
  return [formResource(form)];
}

export class WixCliService implements WixService {
  async ensureAppPermissions(
    permissionIds: string[],
    workspace: Workspace,
    onProgress: (message: string) => Promise<void> = async () => undefined,
  ): Promise<boolean> {
    const requested = [...new Set(permissionIds)].filter(Boolean);
    if (requested.length === 0) return false;
    const project = await existingProject(workspace);
    if (!project) throw new Error("The Wix project must be provisioned before app permissions");
    const apiKey = process.env.WIX_API_KEY;
    if (!apiKey) throw new Error("WIX_API_KEY is not configured");
    const accountId = process.env.WIX_ACCOUNT_ID;
    if (!accountId) {
      throw new WixAccountConfigurationError(
        "WIX_ACCOUNT_ID is not configured. Copy the Account ID from the Wix API Keys Manager, add it to .env.local, restart the worker, and retry this step.",
      );
    }

    await onProgress("Checking the Wix services required by this site");
    const query = new URLSearchParams({ appId: project.appId, consistent: "true" });
    const path = `/apps/v1/app-permissions/v1/app-permissions?${query.toString()}`;
    const listed = await wixAccountRequest<{
      appPermissions?: Array<{
        permissionId?: string;
        permission?: { permissionId?: string; id?: string };
      }>;
    }>(apiKey, accountId, path);
    const existing = new Set(
      (listed.appPermissions ?? []).flatMap((entry) => {
        const id = entry.permission?.permissionId ?? entry.permission?.id ?? entry.permissionId;
        return id ? [id] : [];
      }),
    );
    const missing = requested.filter((permissionId) => !existing.has(permissionId));
    if (missing.length === 0) return false;

    await onProgress(
      `Connecting ${missing.length} required Wix ${missing.length === 1 ? "service" : "services"}`,
    );
    for (const permissionId of missing) {
      await wixAccountRequest(apiKey, accountId, "/apps/v1/app-permissions/v1/app-permissions", {
        method: "POST",
        body: JSON.stringify({
          appPermission: {
            appId: project.appId,
            permission: { permissionId },
          },
        }),
      });
    }
    await onProgress("Required Wix services are connected");
    return true;
  }

  async ensureSdkPackages(
    packageNames: string[],
    workspace: Workspace,
    onProgress: (message: string) => Promise<void> = async () => undefined,
  ): Promise<void> {
    const requested = [...new Set(packageNames)].filter(Boolean);
    const invalid = requested.filter(
      (name) => !/^@wix\/[a-z0-9][a-z0-9._-]*$/i.test(name) && name !== "@astrojs/react",
    );
    if (invalid.length > 0) {
      throw new Error(
        `Wix capability research returned unsupported packages: ${invalid.join(", ")}`,
      );
    }
    if (requested.length === 0) return;
    const manifest = JSON.parse(await workspace.readFile("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = { ...manifest.dependencies, ...manifest.devDependencies };
    const missing = requested.filter((name) => !installed[name]);
    if (missing.length === 0) return;
    await onProgress(
      `Installing ${missing.length} required Wix SDK ${missing.length === 1 ? "package" : "packages"}`,
    );
    const install = await workspace.exec("npm", ["install", ...missing]);
    if (install.exitCode !== 0) {
      throw new Error(commandError(install, "Required Wix SDK packages could not be installed"));
    }
  }

  async setEnvironmentVariables(
    values: Record<string, string>,
    workspace: Workspace,
  ): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      const result = await workspace.exec("wix", ["env", "set", "--key", key, "--value", value]);
      if (result.exitCode !== 0) {
        throw new Error(commandError(result, `Wix could not save ${key}`, [value]));
      }
    }
  }

  async provision(input: ProvisionInput, workspace: Workspace): Promise<WixProject> {
    await workspace.materialize(input.projectId);
    const existing = await existingProject(workspace);
    if (existing) return existing;

    const apiKey = process.env.WIX_API_KEY;
    if (!apiKey) throw new Error("WIX_API_KEY is not configured");

    const login = await workspace.exec("wix", ["login", "--api-key", apiKey], {
      cwd: "parent",
      env: { CI: "1" },
      tty: true,
    });
    if (login.exitCode !== 0) {
      throw new Error(commandError(login, "Wix authentication failed", [apiKey]));
    }

    const folderName = workspace.root.split(/[\\/]/).pop();
    if (!folderName) throw new Error("Could not determine the Wix project folder name");
    const create = await workspace.exec(
      "npm",
      [
        "create",
        "@wix/new@latest",
        "headless",
        "--",
        "--folder-name",
        folderName,
        "--business-name",
        input.businessName,
        "--site-template",
        input.siteTemplate ?? "blank",
      ],
      {
        cwd: "parent",
        env: {
          CI: "1",
          // The worker itself is launched by pnpm, so npm inherits pnpm's user-agent.
          // Wix's creator supports npm but rejects the inherited parent identity even
          // though this subprocess is genuinely npm. Give the child its own identity.
          npm_config_user_agent: `npm/11 node/${process.version} ${process.platform} ${process.arch}`,
          npm_execpath: "npm",
        },
      },
    );
    if (create.exitCode !== 0) throw new Error(commandError(create, "Wix project creation failed"));
    return parseConfig(await workspace.readFile("wix.config.json"));
  }

  async prepareSiteResources(
    specification: Specification,
    externalMediaUrls: string[],
    workspace: Workspace,
    onProgress: (message: string) => Promise<void> = async () => undefined,
  ): Promise<WixSiteResources> {
    await onProgress("Reading the Wix project configuration");
    const project = await existingProject(workspace);
    if (!project) throw new Error("The Wix project must be provisioned before site resources");
    await onProgress("Requesting secure Wix site access");
    const token = await siteToken(workspace, project.siteId);
    if (specification.infrastructure.cmsCollections.length > 0) {
      await onProgress("Checking Wix CMS dependencies");
      await ensureCmsDependencies(workspace);
    }
    const workflows = specification.infrastructure.visitorWorkflows;
    const usesForms = workflows.some((workflow) =>
      workflow.actions.some((action) => action.type === "saveFormSubmission"),
    );
    const usesCrm =
      usesForms ||
      workflows.some((workflow) =>
        workflow.actions.some(
          (action) =>
            action.type === "createOrUpdateContact" || action.type === "sendTriggeredEmail",
        ),
      );
    if (usesCrm) {
      await onProgress("Checking Wix CRM dependencies");
      await ensureCrmDependencies(workspace);
    }
    await onProgress("Preparing Wix CMS collections");
    const cmsCollections = await ensureCmsCollections(
      project.siteId,
      token,
      specification.infrastructure.cmsCollections,
    );
    await onProgress("Preparing Wix Forms");
    const forms = await ensureForms(project.siteId, token, usesForms);
    if (forms.length > 0) {
      await onProgress("Checking Wix Forms dependencies");
      await ensureFormDependencies(workspace);
    }
    await onProgress("Importing site media into Wix");
    const media = await importMedia(project.siteId, token, externalMediaUrls);
    await onProgress("Wix site resources are ready");
    return {
      cmsCollections,
      forms,
      formsMode: usesForms && forms.length > 0 ? "wixForms" : "customCrm",
      media,
    };
  }

  async build(workspace: Workspace): Promise<void> {
    const result = await workspace.exec("wix", ["build"], { env: { CI: "1" } });
    if (result.exitCode !== 0) throw new Error(commandError(result, "Wix build failed"));
  }

  async preview(
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<{ url: string }> {
    return await deployWixPreview(workspace, onProgress);
  }
}
