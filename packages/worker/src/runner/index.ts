/**
 * The execution layer, behind one interface.
 *
 * V1  → LocalRunner   (the poll loop in ../index.ts)
 * V2  → TriggerRunner (Trigger.dev)
 *
 * Business logic never changes when this is swapped. Only the executor does.
 * This is the entire reason the interface exists — do not let stage handlers
 * reach around it.
 */

export interface JobRunner {
  /** Advance a single project by exactly one stage. */
  executeStage(projectId: string): Promise<void>;
}

// TODO(phase-1): LocalRunner implements JobRunner.
// TODO(v2):      TriggerRunner implements JobRunner.
