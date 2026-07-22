import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Design, Specification, WebsiteContent } from "@factory/shared";
import { loadPrompt } from "../lib/prompts";
import { loadFactorySkill, loadFactorySkills } from "../lib/skills";
import type { WorkContext } from "../operations/context";
import type { Workspace } from "../workspace";
import { runAgent } from "./agent-runtime";
import type { WixService } from "./wix";

/** What the agent raised for the owner while building. */
export interface BuildReports {
  questions: Array<{ title: string; detail: string }>;
  manualTasks: Array<{ title: string; detail: string; dashboardUrl?: string }>;
  content: WebsiteContent["items"];
  unitsBuilt: string[];
}

export interface CodeBuildInput {
  workspace: Workspace;
  wix: WixService;
  /** The provisioned site id; enables the CMS/media provisioning tools. */
  siteId?: string;
  spec: Specification;
  design: Design;
  /** Screen path → URL of the design HTML the design stage produced. */
  designHtmlUrls?: Record<string, string>;
  /** Owner content baked into this build (from the refine loop); may be empty. */
  content?: WebsiteContent;
  /** Optional revision feedback driving this rebuild. */
  feedback?: string;
}

/** Commands the code agent may run in the workspace (first token allow-list). */
const ALLOWED_COMMANDS = new Set(["npm", "npx", "node", "wix", "astro", "ls", "cat", "git"]);

/**
 * The code engine: runs an agent over the project workspace to implement the
 * approved site (pages, workflows, backend). All file/exec access is routed
 * through the Workspace and all Wix provisioning through WixService, so nothing
 * here touches the filesystem or network directly.
 */
export class CodeGenerator {
  async build(ctx: WorkContext, input: CodeBuildInput): Promise<{ summary: string; reports: BuildReports }> {
    const reports: BuildReports = { questions: [], manualTasks: [], content: [], unitsBuilt: [] };
    const tools: ToolSet = {
      ...this.skillTools(),
      ...this.workspaceTools(ctx, input.workspace),
      ...this.designTools(input.designHtmlUrls ?? {}),
      ...(input.siteId ? this.wixTools(input.wix, input.siteId) : {}),
      ...this.reportTools(reports),
    };

    // Surface the Wix skills the scaffold ships so the agent knows they exist
    // and reads them (rather than hoping it runs `ls`) — the SDK/API patterns
    // Wix maintains are more reliable than the model guessing.
    const projectWixSkills = await discoverSkills(input.workspace);
    ctx.log("info", `Found ${projectWixSkills.length} Wix skill docs in the project`);

    const prompt = JSON.stringify(
      {
        specification: input.spec,
        // Screens carry the design prompt (intended layout) + path; the agent
        // implements each page to match.
        screens: input.design.screens.map((s) => ({ name: s.name, path: s.path, design: s.prompt })),
        ownerContent: input.content?.items ?? [],
        requestedChange: input.feedback,
        // Factory skills (how the factory wants Wix sites built) — read the
        // relevant one with readSkill(name). Wix's own shipped skills are in
        // projectWixSkills (read with readFile).
        factorySkills: loadFactorySkills().map((s) => ({ name: s.name, description: s.description })),
        projectWixSkills,
      },
      null,
      2,
    );

    const run = await runAgent({ instructions: loadPrompt("code"), prompt, tools, maxSteps: 80 });
    return { summary: run.text, reports };
  }

  /** One scoped repair pass over a failing build command. */
  async repair(
    ctx: WorkContext,
    input: { workspace: Workspace; wix: WixService; siteId?: string; summary: string; failure: { command: string; stdout: string; stderr: string } },
    reports: BuildReports,
  ): Promise<void> {
    const tools: ToolSet = {
      ...this.skillTools(),
      ...this.workspaceTools(ctx, input.workspace),
      ...(input.siteId ? this.wixTools(input.wix, input.siteId) : {}),
      ...this.reportTools(reports),
    };
    const prompt = JSON.stringify({ command: input.failure, summary: input.summary }, null, 2);
    await runAgent({ instructions: loadPrompt("fix"), prompt, tools, maxSteps: 30 });
  }

  private skillTools(): ToolSet {
    return {
      readSkill: tool({
        description:
          "Read a factory skill by name (from the factorySkills list) for how the factory wants a given area built. Read the relevant skill before writing code for it.",
        inputSchema: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          const skill = loadFactorySkill(name);
          return skill ? { body: skill.body } : { error: `No skill named ${name}` };
        },
      }),
    };
  }

  private workspaceTools(ctx: WorkContext, workspace: Workspace): ToolSet {
    return {
      readFile: tool({
        description: "Read a file from the project, relative to its root.",
        inputSchema: z.object({ path: z.string() }),
        execute: async ({ path }) => {
          try {
            return { content: await workspace.readFile(path) };
          } catch {
            return { error: "File not found" };
          }
        },
      }),
      writeFile: tool({
        description: "Create or overwrite a file in the project, relative to its root.",
        inputSchema: z.object({ path: z.string(), content: z.string() }),
        execute: async ({ path, content }) => {
          await workspace.writeFile(path, content);
          return { ok: true };
        },
      }),
      exec: tool({
        description:
          "Run a build/tooling command in the project. Allowed: npm, npx, node, wix, astro, ls, cat, git.",
        inputSchema: z.object({ command: z.string(), args: z.array(z.string()).default([]) }),
        execute: async ({ command, args }) => {
          if (!ALLOWED_COMMANDS.has(command)) {
            return { error: `Command not allowed: ${command}` };
          }
          const result = await workspace.exec(command, args, { timeoutMs: 10 * 60 * 1000 });
          ctx.log("info", `agent exec: ${command} ${args.join(" ")} → ${result.code}`);
          return {
            code: result.code,
            stdout: result.stdout.slice(-4000),
            stderr: result.stderr.slice(-4000),
          };
        },
      }),
    };
  }

  private designTools(htmlUrls: Record<string, string>): ToolSet {
    return {
      readDesign: tool({
        description:
          "Read the approved design HTML for a page (by its path, e.g. '/' or '/courses'). Use it as the visual reference for that page's markup and styles.",
        inputSchema: z.object({ path: z.string() }),
        execute: async ({ path }) => {
          const url = htmlUrls[path];
          if (!url) return { error: `No design found for path ${path}` };
          const res = await fetch(url);
          if (!res.ok) return { error: `Could not load design (${res.status})` };
          return { html: await res.text() };
        },
      }),
    };
  }

  private wixTools(wix: WixService, siteId: string): ToolSet {
    return {
      createCollection: tool({
        description: "Create a Wix CMS data collection for repeating/structured content.",
        inputSchema: z.object({
          id: z.string(),
          displayName: z.string(),
          fields: z.array(z.object({ key: z.string(), displayName: z.string(), type: z.string() })),
        }),
        execute: async (collection) => {
          await wix.createCollection(siteId, collection);
          return { ok: true };
        },
      }),
      seedItems: tool({
        description: "Insert seed rows into a CMS collection.",
        inputSchema: z.object({
          collectionId: z.string(),
          items: z.array(z.record(z.string(), z.unknown())),
        }),
        execute: async ({ collectionId, items }) => {
          await wix.seedItems(siteId, collectionId, items as Record<string, unknown>[]);
          return { ok: true };
        },
      }),
      importMedia: tool({
        description: "Import images/logos into the Media Manager from external URLs.",
        inputSchema: z.object({
          files: z.array(z.object({ url: z.string(), displayName: z.string(), mimeType: z.string().optional() })),
        }),
        execute: async ({ files }) => {
          await wix.importMedia(siteId, files);
          return { ok: true };
        },
      }),
    };
  }

  private reportTools(reports: BuildReports): ToolSet {
    return {
      reportQuestion: tool({
        description:
          "Report a question for the owner that the earlier questions phase did not answer. Continue with a reasonable assumption.",
        inputSchema: z.object({ title: z.string(), detail: z.string() }),
        execute: async ({ title, detail }) => {
          reports.questions.push({ title, detail });
          return { recorded: true };
        },
      }),
      reportManualTask: tool({
        description:
          "Report a setup step you cannot do from code (e.g. connect payments, upgrade Premium, custom domain).",
        inputSchema: z.object({
          title: z.string(),
          detail: z.string(),
          dashboardUrl: z.string().optional(),
        }),
        execute: async ({ title, detail, dashboardUrl }) => {
          reports.manualTasks.push({ title, detail, dashboardUrl });
          return { recorded: true };
        },
      }),
      requestContent: tool({
        description:
          "Declare a piece of one-off content the owner should provide (page copy, hero image, logo). Use a placeholder until then.",
        inputSchema: z.object({
          key: z.string(),
          label: z.string(),
          kind: z.enum(["text", "longtext", "image", "logo"]),
          page: z.string().optional(),
          placeholder: z.string().optional(),
        }),
        execute: async ({ key, label, kind, page, placeholder }) => {
          reports.content.push({ key, label, kind, page, placeholder, value: null });
          return { recorded: true };
        },
      }),
      markUnitDone: tool({
        description: "Record that a build unit is complete, e.g. 'page:/about' or 'workflow:contact'.",
        inputSchema: z.object({ unit: z.string() }),
        execute: async ({ unit }) => {
          reports.unitsBuilt.push(unit);
          return { recorded: true };
        },
      }),
    };
  }
}

/**
 * Find the Wix skill docs the scaffold ships (under `.agents/`, `.wix/`, a
 * `skills/` dir, or a top-level SKILL/AGENTS file) so the agent can be pointed
 * at them by path + one-line summary and read the relevant ones.
 */
async function discoverSkills(workspace: Workspace): Promise<Array<{ path: string; summary: string }>> {
  const found = new Set<string>();
  for (const dir of [".agents", ".wix", "skills"]) {
    for (const file of await workspace.list(dir, { recursive: true })) {
      if (/\.mdx?$/i.test(file)) found.add(file);
    }
  }
  for (const file of await workspace.list(".", { recursive: false })) {
    if (/(^|\/)(skill|agents)\.mdx?$/i.test(file)) found.add(file);
  }

  const skills: Array<{ path: string; summary: string }> = [];
  for (const path of [...found].slice(0, 40)) {
    try {
      const text = await workspace.readFile(path);
      const firstLine = text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
      skills.push({ path, summary: firstLine.replace(/^#+\s*/, "").slice(0, 140) });
    } catch {
      // Unreadable — skip.
    }
  }
  return skills;
}
