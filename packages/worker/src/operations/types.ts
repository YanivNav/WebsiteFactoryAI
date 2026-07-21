import { WORK_DEFINITIONS, type WorkOperation } from "@factory/shared";
import type { WorkCompletion } from "../server";
import type { WorkContext } from "./context";

export interface WorkHandler<K extends WorkOperation = WorkOperation> {
  readonly operation: K;
  run(context: WorkContext<K>): Promise<WorkCompletion>;
}

/**
 * The standard completion for an operation: open its review task (as declared
 * in WORK_DEFINITIONS) on the artifact it produced.
 */
export function reviewCompletion(
  operation: WorkOperation,
  subjectArtifactId: string,
  previousResultArtifactId?: string,
): WorkCompletion {
  const definition = WORK_DEFINITIONS[operation];
  return {
    type: "createUserTask",
    task: {
      phase: definition.phase,
      label: definition.review.label,
      subjectArtifactId,
      previousResultArtifactId,
      result: definition.review.result,
    },
  };
}
