import type { Stage } from "@factory/shared";
import type { StageContext } from "./context";

export type StageResult =
  | { kind: "advance"; target?: Stage }
  | {
      kind: "awaitArtifact";
      target: Stage;
      artifactId: string;
      gateKind: "answers" | "review";
    }
  | { kind: "failed"; error: string };

export interface StageHandler {
  readonly stage: Stage;
  run(context: StageContext): Promise<StageResult>;
}
