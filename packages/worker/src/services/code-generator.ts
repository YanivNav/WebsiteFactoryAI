import { Codex } from "@openai/codex-sdk";
import type { Design, Specification, WebsiteContent } from "@factory/shared";
import { loadPrompt } from "../lib/prompts";
import { buildGlobalAgentsDoc } from "../lib/skills";
import type { WorkContext } from "../operations/context";
import { ensureAgentHome, type Workspace } from "../workspace";

/** What the agent raised for the owner while building, read back from its report. */
export interface BuildReports {
  questions: Array<{ title: string; detail: string }>;
  manualTasks: Array<{ title: string; detail: string; dashboardUrl?: string }>;
  content: WebsiteContent["items"];
  unitsBuilt: string[];
}

export interface CodeBuildInput {
  workspace: Workspace;
  spec: Specification;
  design: Design;
  /** Screen path → URL of the design HTML the design stage produced. */
  designHtmlUrls?: Record<string, string>;
  /** Owner content baked into this build (from the refine loop); may be empty. */
  content?: WebsiteContent;
  /** Optional revision feedback driving this rebuild. */
  feedback?: string;
}

/** Where the factory hands inputs to the agent and reads its report back. */
const FACTORY_DIR = ".factory";
const BRIEF_FILE = `${FACTORY_DIR}/brief.json`;
const REPORT_FILE = `${FACTORY_DIR}/report.json`;

const EMPTY_REPORTS: BuildReports = { questions: [], manualTasks: [], content: [], unitsBuilt: [] };

/**
 * The code engine: a real coding agent (Codex) working directly in the project.
 *
 * It has its own file editing, search, and shell — so the factory does not
 * supply read/write/exec tools. The contract is file-based instead: the factory
 * writes the brief and the approved designs into `.factory/`, and the agent
 * writes `.factory/report.json` back.
 *
 * Instructions come from Codex's own layering: our factory skills are the
 * GLOBAL `AGENTS.md` in a factory-owned CODEX_HOME (one copy, applies to every
 * project, updated centrally), and the project's Wix skills sit closer to the
 * work so they take precedence.
 */
export class CodeGenerator {
  async build(ctx: WorkContext, input: CodeBuildInput): Promise<{ summary: string; reports: BuildReports }> {
    await this.writeBrief(input);
    const summary = await this.run(ctx, input.workspace, loadPrompt("build-task"));
    const reports = await this.readReport(input.workspace);
    return { summary: reports.summary ?? summary, reports: reports.reports };
  }

  /** One scoped repair pass over a failing build command. */
  async repair(
    ctx: WorkContext,
    input: { workspace: Workspace; summary: string; failure: { command: string; stdout: string; stderr: string } },
    reports: BuildReports,
  ): Promise<void> {
    const prompt = [
      loadPrompt("fix"),
      "",
      `Command: ${input.failure.command}`,
      input.failure.stderr || input.failure.stdout,
    ].join("\n");
    await this.run(ctx, input.workspace, prompt);
    // Pick up anything the repair pass reported.
    const after = await this.readReport(input.workspace);
    reports.questions.push(...after.reports.questions);
    reports.manualTasks.push(...after.reports.manualTasks);
  }

  /** Run the coding agent in the project directory until it finishes the task. */
  private async run(ctx: WorkContext, workspace: Workspace, prompt: string): Promise<string> {
    const codexHome = await ensureCodexHome(ctx);
    const codex = new Codex({
      apiKey: process.env.OPENAI_API_KEY,
      // `env` replaces the CLI's environment entirely, so pass the parent's too
      // (PATH, HOME, …) plus our factory-owned Codex home.
      env: { ...(process.env as Record<string, string>), CODEX_HOME: codexHome },
    });
    const thread = codex.startThread({
      workingDirectory: workspace.root,
      model: codexModel(),
      // The agent must be able to edit the project, install packages, and call
      // the Wix CLI — and nobody is there to approve anything.
      sandboxMode: "workspace-write",
      networkAccessEnabled: true,
      approvalPolicy: "never",
      skipGitRepoCheck: true,
    });
    ctx.log("info", `Running the coding agent (${codexModel()}) in ${workspace.name}`);
    const turn = await thread.run(prompt);
    return turn.finalResponse ?? "";
  }

  /** Write the brief + approved designs the agent reads. */
  private async writeBrief(input: CodeBuildInput): Promise<void> {
    const brief = {
      specification: input.spec,
      screens: input.design.screens.map((s) => ({
        name: s.name,
        path: s.path,
        design: s.prompt,
        designFile: designFileFor(s.path),
      })),
      ownerContent: input.content?.items ?? [],
      requestedChange: input.feedback,
    };
    await input.workspace.writeFile(BRIEF_FILE, JSON.stringify(brief, null, 2));

    for (const [screenPath, url] of Object.entries(input.designHtmlUrls ?? {})) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        await input.workspace.writeFile(designFileFor(screenPath), await response.text());
      } catch {
        // A missing design is not fatal — the brief still describes the page.
      }
    }
  }

  /** Read the agent's report, tolerating a missing or malformed file. */
  private async readReport(
    workspace: Workspace,
  ): Promise<{ summary?: string; reports: BuildReports }> {
    if (!(await workspace.hasFile(REPORT_FILE))) return { reports: { ...EMPTY_REPORTS } };
    try {
      const parsed = JSON.parse(await workspace.readFile(REPORT_FILE)) as Partial<BuildReports> & {
        summary?: string;
      };
      return {
        summary: parsed.summary,
        reports: {
          questions: parsed.questions ?? [],
          manualTasks: parsed.manualTasks ?? [],
          content: parsed.content ?? [],
          unitsBuilt: parsed.unitsBuilt ?? [],
        },
      };
    } catch {
      return { reports: { ...EMPTY_REPORTS } };
    }
  }
}

function designFileFor(screenPath: string): string {
  const slug = screenPath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "home";
  return `${FACTORY_DIR}/design/${slug}.html`;
}

/** Codex takes a plain model id; `CODE_MODEL` may carry a `provider:` prefix. */
function codexModel(): string {
  const spec = process.env.CODE_MODEL ?? "gpt-5-codex";
  return spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec;
}

/**
 * Install the factory skills as the agent's GLOBAL instructions — one copy that
 * applies to every project we build and updates centrally when a skill changes.
 */
async function ensureCodexHome(ctx: WorkContext): Promise<string> {
  const home = await ensureAgentHome({ "AGENTS.md": buildGlobalAgentsDoc() });
  ctx.log("info", `Factory skills installed as global agent instructions (${home})`);
  return home;
}
