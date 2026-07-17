import type { ProjectMode, Stage } from "@factory/shared";
import type { ProjectId, ProjectStore } from "../store";

/** Inputs and infrastructure available to one isolated stage implementation. */
export interface StageContext {
  projectId: ProjectId;
  projectTitle: string;
  stage: Stage;
  brief: string;
  mode: ProjectMode;
  settings: { publishTarget: string };
  attempts: number;
  store: ProjectStore;
  log(message: string, data?: Record<string, unknown>): Promise<void>;
}

export type StageResult =
  { kind: "advance" } | { kind: "failed"; error: string; retryable: boolean };

export interface StageHandler {
  readonly stage: Stage;
  run(context: StageContext): Promise<StageResult>;
}
