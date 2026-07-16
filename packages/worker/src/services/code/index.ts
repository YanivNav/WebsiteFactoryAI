import type { Specification } from "@factory/shared";
import type { Workspace } from "../../workspace";

export interface CodeDesignScreen {
  pageTitle: string;
  pagePath: string;
  htmlPath: string;
  screenshotPath: string;
}

export interface CodeInput {
  task: string;
  specification: Specification;
  screens: CodeDesignScreen[];
}

export interface CodeResult {
  summary: string;
  promptHash: string;
  model: string;
}

export interface CodeGenerator {
  build(
    input: CodeInput,
    workspace: Workspace,
    onProgress?: (message: string) => Promise<void>,
  ): Promise<CodeResult>;
}
