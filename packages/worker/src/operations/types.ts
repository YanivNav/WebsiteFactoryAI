import type { WorkOperation } from "@factory/shared";
import type { WorkCompletion } from "../server";
import type { WorkContext } from "./context";

export interface WorkHandler<K extends WorkOperation = WorkOperation> {
  readonly operation: K;
  run(context: WorkContext<K>): Promise<WorkCompletion>;
}
