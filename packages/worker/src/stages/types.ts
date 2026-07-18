import type {Stage} from "@factory/shared";
import type {StageContext} from "./context";


export type StageResult =
  { kind: "advance", target?: Stage } | { kind: "failed"; error: string; retryable: boolean };

export interface StageHandler {
  readonly stage: Stage;
  run(context: StageContext): Promise<StageResult>;
}
