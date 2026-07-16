import { hashInputs } from "../../lib/hash.js";
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

export class OpenAICodexGenerator implements CodeGenerator {
  async build(
    input: CodeInput,
    workspace: Workspace,
    onProgress: (message: string) => Promise<void> = async () => undefined,
  ): Promise<CodeResult> {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const prompt = loadPrompt("code");
    const model = modelName();
    const instruction = [
      prompt.text,
      `Scoped task:\n${input.task}`,
      "Approved specification and screen inventory are in `.factory/context/site.json`.",
      `Screens to implement:\n${input.screens
        .map(
          (screen) =>
            `- ${screen.pageTitle} (${screen.pagePath}) — HTML: ${screen.htmlPath}; screenshot: ${screen.screenshotPath}`,
        )
        .join("\n")}`,
    ].join("\n\n");
    await onProgress(`Implementing the approved site with ${model}`);
    const imageArgs = input.screens.flatMap((screen) => ["--image", screen.screenshotPath]);
    const result = await workspace.exec(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
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
      { stdin: instruction, env: { CI: "1" } },
    );
    if (result.exitCode !== 0) {
      const detail = (result.stderr.trim() || result.stdout.trim()).slice(-2_000);
      throw new Error(detail ? `Code generation failed: ${detail}` : "Code generation failed");
    }
    return {
      summary: finalSummary(result.stdout),
      promptHash: hashInputs([prompt.hash, instruction]),
      model,
    };
  }
}
