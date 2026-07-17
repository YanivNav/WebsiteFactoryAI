import path from "node:path";
import { loadPrompt } from "../../lib/prompts.js";
import type { Workspace } from "../../workspace";
import type { CodeGenerator, CodeInput, CodeResult } from ".";

function modelName() {
  const configured = process.env.CODE_MODEL?.trim();
  if (!configured) return "gpt-5.6-terra";
  const [provider, ...model] = configured.split(":");
  if (provider !== "openai" || model.length === 0) {
    throw new Error("CODE_MODEL must use the format openai:model-id");
  }
  return model.join(":");
}

function finalSummary(output: string) {
  const messages: string[] = [];
  for (const line of output.split("\n")) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
      };
      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        event.item.text
      ) {
        messages.push(event.item.text);
      }
    } catch {
      // Codex JSONL may be preceded by a platform warning. It is not result state.
    }
  }
  return messages.at(-1)?.trim() || "Implemented the approved website design.";
}

function failureDetail(stdout: string, stderr: string) {
  const messages: string[] = [];
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        message?: string;
        error?: { message?: string };
        item?: { type?: string; text?: string };
      };
      if (event.type === "error" && event.message) messages.push(event.message);
      if (event.type === "turn.failed" && event.error?.message) {
        messages.push(event.error.message);
      }
      if (event.item?.type === "error" && event.item.text) messages.push(event.item.text);
    } catch {
      // Only JSONL events carry result state.
    }
  }
  if (messages.length > 0) return messages.at(-1)!;

  const usefulStderr = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== "Reading prompt from stdin..." &&
        !line.startsWith("WARNING: proceeding, even though we could not create PATH aliases"),
    )
    .join("\n");
  return usefulStderr || "Codex stopped before completing the site implementation";
}

export class OpenAICodexGenerator implements CodeGenerator {
  async build(
    input: CodeInput,
    workspace: Workspace,
    onProgress: (message: string) => Promise<void> = async () => undefined,
  ): Promise<CodeResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    const prompt = loadPrompt("code");
    const model = modelName();
    const instruction = [
      prompt.text,
      input.unit
        ? [
            `Current implementation unit: ${input.unit.title} (${input.unit.kind})`,
            `Unit id: ${input.unit.id}`,
            `Acceptance criteria:\n${input.unit.acceptanceCriteria
              .map((criterion) => `- ${criterion}`)
              .join("\n")}`,
          ].join("\n")
        : "",
      `Scoped task:\n${input.task}`,
      "Approved specification and screen inventory are in `.factory/context/site.json`.",
      `Screens to implement:\n${input.screens
        .map(
          (screen) =>
            `- ${screen.pageTitle} (${screen.pagePath}) — HTML: ${screen.htmlPath}; screenshot: ${screen.screenshotPath}`,
        )
        .join("\n")}`,
    ].join("\n\n");
    await onProgress(input.unit ? `Implementing ${input.unit.title}` : "Implementing the site");
    const imageArgs = input.screens.flatMap((screen) => [
      "--image",
      path.resolve(workspace.root, screen.screenshotPath),
    ]);
    const result = await workspace.exec(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--config",
        'shell_environment_policy.inherit="core"',
        "--config",
        "shell_environment_policy.ignore_default_excludes=false",
        "--model",
        model,
        "--sandbox",
        "workspace-write",
        "--cd",
        workspace.root,
        "--color",
        "never",
        "--json",
        ...imageArgs,
        "-",
      ],
      {
        stdin: instruction,
        env: { CI: "1", CODEX_API_KEY: apiKey },
        omitEnv: [
          "ANTHROPIC_API_KEY",
          "CONVEX_DEPLOYMENT",
          "GITHUB_TOKEN",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "NEXT_PUBLIC_CONVEX_URL",
          "OPENAI_API_KEY",
          "STITCH_API_KEY",
          "WIX_API_KEY",
        ],
      },
    );
    if (result.exitCode !== 0) {
      throw new Error(`Code generation failed: ${failureDetail(result.stdout, result.stderr)}`);
    }
    return {
      summary: finalSummary(result.stdout),
      promptHash: prompt.hash,
      model,
    };
  }
}
