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

export class WixCliService implements WixService {
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
}
