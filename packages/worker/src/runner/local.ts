/**
 * LocalRunner — the V1 execution layer.
 *
 * The whole worker, in one sentence: lease a project, run exactly one stage, commit
 * the result. Then do it again.
 *
 * V2 swaps this for a Trigger.dev runner. The business logic — the handlers, the
 * state machine, the store — does not move. That is what the `JobRunner` interface
 * is for; do not reach around it.
 */

import { nextStage } from "@factory/shared";
import type { JobRunner } from "./index.js";
import type { ProjectStore } from "../store/index.js";
import { HANDLERS } from "../stages/index.js";
import type { StageContext } from "../stages/types.js";

export class LocalRunner implements JobRunner {
  constructor(
    private readonly store: ProjectStore,
    private readonly workerId: string,
    private readonly leaseTtlSeconds: number,
  ) {}

  /**
   * Attempt one unit of work. Returns true if something was done (so the caller can
   * poll again immediately rather than sleeping).
   */
  async tick(): Promise<boolean> {
    const project = await this.store.leaseNextRunnable(this.workerId, this.leaseTtlSeconds);
    if (!project) return false;

    const prefix = `[worker ${this.workerId}] [project ${project.id}] [${project.currentStage}]`;
    const attempt = project.attempts + 1;
    console.log(`${prefix} leased — attempt ${attempt}`);
    await this.store.appendLog({
      projectId: project.id,
      stage: project.currentStage,
      level: "info",
      message: attempt > 1 ? `Retry attempt ${attempt} started` : "Work started",
      data: { kind: "attempt-started", attempt },
    });

    const handler = HANDLERS[project.currentStage];

    if (!handler) {
      // A runnable stage with no handler is a programming error, not a runtime one.
      // Fail loudly rather than silently parking the project forever.
      const error = `No handler registered for stage ${project.currentStage}`;
      console.error(`${prefix} failed — ${error}`);
      await this.store.commitResult(project.id, this.workerId, {
        kind: "failed",
        error,
      });
      return true;
    }

    // Keep the lease warm while the stage runs, or a long stage gets reclaimed
    // out from under itself.
    const renew = setInterval(
      () => {
        void this.store
          .renewLease(project.id, this.workerId)
          .then(() => console.log(`${prefix} lease renewed`))
          .catch((error) => console.error(`${prefix} lease renewal failed`, error));
      },
      (this.leaseTtlSeconds * 1000) / 3,
    );

    try {
      const ctx: StageContext = {
        projectId: project.id,
        stage: project.currentStage,
        brief: project.brief,
        mode: project.settings.mode,
        attempts: project.attempts,
        store: this.store,
        log: async (message, data) => {
          console.log(`${prefix} ${message}`);
          await this.store.appendLog({
            projectId: project.id,
            stage: project.currentStage,
            level: "info",
            message,
            data,
          });
        },
        emitArtifact: async (type, data, provenance) => {
          console.log(`${prefix} storing ${type}`);
          await this.store.appendArtifact({
            projectId: project.id,
            type,
            data,
            // Provenance comes from the stage, because only the stage knows which
            // prompt it used and which inputs it resolved. The runner just records it.
            promptHash: provenance.promptHash,
            inputsHash: provenance.inputsHash,
          });
          console.log(`${prefix} stored ${type}`);
        },
      };

      const result = await handler.run(ctx);

      if (result.kind === "advance") {
        // The handler does not decide what comes next — the machine does, from the
        // pure shared transition table. Handlers stay independent and ignorant of
        // each other, which is what lets any of them be rerun in isolation.
        const next = nextStage(project.currentStage, project.settings.mode);
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next,
        });
        console.log(`${prefix} completed → ${next}`);
      } else if (result.kind === "route") {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next: result.next,
        });
        console.log(`${prefix} routed → ${result.next}`);
      } else if (result.kind === "questions") {
        const next = result.hasQuestions ? "WaitingForAnswers" : "GeneratingSpecification";
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next,
        });
        console.log(`${prefix} completed → ${next}`);
      } else if (result.kind === "manualTasks") {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "manualTasks",
          tasks: result.tasks,
        });
        console.log(`${prefix} completed → WaitingForManualActions (${result.tasks.length} tasks)`);
      } else {
        console.error(`${prefix} failed — ${result.error}`);
        await this.store.commitResult(project.id, this.workerId, {
          kind: "failed",
          error: result.error,
        });
        console.log(`${prefix} failure recorded; stage is ready to retry`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} attempt ${attempt} threw — ${message}`);

      // A thrown handler is just a failure. The lease is released, the stage stays
      // put, and it becomes leasable again — because the stage is deterministic from
      // its inputs, redoing it is always safe.
      try {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "failed",
          error: message,
        });
        console.log(`${prefix} failure recorded; stage is ready to retry`);
      } catch (commitError) {
        console.error(
          `${prefix} could not record failure; lease must expire before retry`,
          commitError,
        );
      }
    } finally {
      clearInterval(renew);
    }

    return true;
  }

  async executeStage(projectId: string): Promise<void> {
    void projectId;
    // TODO(v2): direct single-project execution, for Trigger.dev's job-per-stage model.
    throw new Error("Not used by LocalRunner — it polls via tick().");
  }
}
