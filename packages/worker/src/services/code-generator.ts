import { Codex } from "@openai/codex-sdk";
import type { Design, Specification, WebsiteContent } from "@factory/shared";
import { loadPrompt } from "../lib/prompts";
import { buildAgentHomeFiles } from "../lib/skills";
import type { WorkContext } from "../operations/context";
import { ensureAgentHome, type Workspace } from "../workspace";

/** What the agent raised for the owner while building, read back from its report. */
export interface BuildReports {
  questions: Array<{ title: string; detail: string }>;
  /**
   * `dashboardPath` is a RELATIVE Wix dashboard path (e.g. "automations") the
   * agent verified from the live docs — never a full URL. The factory scopes it
   * to the real site id, so the agent can't fabricate a link that 404s.
   *
   * `evidence` is the proof the step can't be done by API. `assist` describes a
   * browser run the factory could perform instead, plus how to verify it.
   */
  manualTasks: Array<{
    title: string;
    detail: string;
    dashboardPath?: string;
    evidence?: string;
    assist?: { plan: string; verification: string };
  }>;
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
  /** Wix site id — needed for REST calls (the token is minted against it). */
  siteId?: string;
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

  /** Scoped change pass — uses refine-task.md instead of the full build prompt. */
  async refine(ctx: WorkContext, input: CodeBuildInput): Promise<{ summary: string; reports: BuildReports }> {
    await this.writeBrief(input);
    ctx.log("info", "Refine: " + input.feedback)
    const summary = await this.run(ctx, input.workspace, loadPrompt("refine-task"));
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
      env: { ...(process.env as Record<string, string>), CODEX_HOME: codexHome },
    });
    const thread = codex.startThread({
      workingDirectory: workspace.root,
      model: codexModel(),
      sandboxMode: "workspace-write",
      networkAccessEnabled: true,
      approvalPolicy: "never",
      skipGitRepoCheck: true,
    });
    ctx.log("info", `Running the coding agent (${codexModel()}) in ${workspace.name}`);

    // Stream events so the UI shows the agent's thinking in real time.
    const streamed = await thread.runStreamed(prompt);
    const collected: Array<{ type: string } & Record<string, unknown>> = [];
    let lastReasoning = "";
    let lastCommandSummary = "";
    let pct = 35; // Wiggle the progress bar to show ongoing work.
    const thinking: Array<{ text: string; kind: "thought" | "cmd" | "msg" | "files" | "error" }> = [];
    const pushThinking = () => {
      void ctx.progress(pct, "Building your site", { thinking: [...thinking] });
    };
    for await (const event of streamed.events) {
      if (event.type === "item.updated" || event.type === "item.completed") {
        const item = (event as { item?: unknown }).item as Record<string, unknown> | undefined;
        if (!item) continue;
        collected.push(item as { type: string } & Record<string, unknown>);

        if (item.type === "reasoning") {
          const text = (item as { text?: string }).text ?? "";
          const delta = text.slice(lastReasoning.length);
          if (delta.trim()) {
            thinking.push({ text: delta, kind: "thought" });
            pushThinking();
          }
          lastReasoning = text;
          pct = pct >= 65 ? 38 : pct + 1;
        } else if (item.type === "command_execution") {
          // Don't dump raw shell commands — that turned the feed into a command
          // log instead of the agent's thinking. Surface a short, human summary
          // of what the command is *doing*, deduped so repeats don't pile up.
          const cmd = (item as { command?: string }).command ?? "";
          const summary = summarizeCommand(cmd);
          if (summary && summary !== lastCommandSummary) {
            thinking.push({ text: summary, kind: "cmd" });
            lastCommandSummary = summary;
            pushThinking();
          }
          pct = pct >= 68 ? 42 : pct + 2;
        } else if (item.type === "agent_message") {
          const msg = (item as { message?: string }).message ?? "";
          if (msg.trim()) {
            thinking.push({ text: msg, kind: "msg" });
            pushThinking();
          }
        } else if (item.type === "file_change") {
          const fc = item as { changes?: Array<{ path: string; kind: string }> };
          const paths = (fc.changes ?? []).map((c) => c.path).join(", ");
          if (paths) {
            thinking.push({ text: `Changed: ${paths}`, kind: "files" });
            pushThinking();
          }
        } else if (item.type === "error") {
          const err = item as { message?: string };
          if (err.message) {
            thinking.push({ text: err.message, kind: "error" });
            pushThinking();
          }
        }
      }
    }

    // Build the agent log from collected items for the control panel.
    return collected.find((i: Record<string, unknown>) => i.type === "agent_message" && i.status === "completed")?.message as string ?? "";
  }

  /** Copy factory skills into the project's .agents/skills/ dir. */
  private async writeFactorySkills(workspace: Workspace): Promise<void> {
    const files = buildAgentHomeFiles();
    for (const [relativePath, content] of Object.entries(files)) {
      await workspace.writeFile(relativePath, content).catch(() => {});
    }
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
      // The agent needs the site id to mint REST tokens for calls the SDK
      // doesn't cover. It never receives a dashboard URL — dashboard links are
      // the factory's to compose, so the agent can't fabricate one.
      wix: {
        siteId: input.siteId,
      },
      // Tell the agent it can make real REST calls — not just simulate.
      note: input.siteId
        ? `This is a real Wix project (site id: ${input.siteId}). The Wix CLI is available. You have shell access, curl, and network. If a Wix feature has a REST API, you can discover it via the docs search and call it with a CLI token (read .agents/skills/wix-headless/references/ for the auth pattern). The site is built and running — changes go to the same site.`
        : undefined,
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

/**
 * Turn a raw shell command into a short, plain-language line for the activity
 * feed — the user is a Wix professional, not an engineer, so they want to see
 * *what the agent is doing*, not a terminal transcript. Pure navigation/noise
 * (cd, ls, cat…) collapses to nothing so it never reaches the feed.
 */
function summarizeCommand(command: string): string | undefined {
  const cmd = command.trim();
  if (!cmd) return undefined;
  const first = cmd.split(/\s+/)[0] ?? "";
  if (["cd", "ls", "cat", "echo", "pwd", "true", "head", "tail", "which"].includes(first)) {
    return undefined;
  }
  if (/\bwix\b.*\bbuild\b/.test(cmd)) return "Checking the site builds";
  if (/\bwix\b.*\b(preview|release)\b/.test(cmd)) return "Publishing a preview of the site";
  if (/\bwix\b.*\btoken\b/.test(cmd)) return "Connecting to Wix";
  if (/\b(npm|pnpm|yarn)\b.*\b(install|add|ci)\b/.test(cmd)) return "Installing packages";
  if (/\bcurl\b|wixapis\.com/.test(cmd)) return "Calling a Wix API";
  if (first === "grep" || first === "rg" || first === "find") return "Searching the code";
  if (first === "git") return "Saving progress";
  if (first === "npx" || first === "node") return "Running a build tool";
  // Unknown command: show only the program name, never the full argument list.
  return `Running \`${first}\``;
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
  const files = buildAgentHomeFiles();
  const home = await ensureAgentHome(files);
  ctx.log("info", `Factory skills installed as proper Codex skills (${home}, ${Object.keys(files).length} files)`);
  return home;
}
