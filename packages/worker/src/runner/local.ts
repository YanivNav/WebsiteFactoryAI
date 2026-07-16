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
import type { JobRunner } from ".";
import type { ProjectStore } from "../store";
import { HANDLERS } from "../stages";
import type { StageContext } from "../stages";

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
    console.error(`${prefix} leased — attempt ${attempt}`);
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
        retryable: false,
      });
      return true;
    }

    // Keep the lease warm while the stage runs, or a long stage gets reclaimed
    // out from under itself.
    const renew = setInterval(
      () => {
        void this.store
          .renewLease(project.id, this.workerId)
          .then(() => console.error(`${prefix} lease renewed`))
          .catch((error) => console.error(`${prefix} lease renewal failed`, error));
      },
      (this.leaseTtlSeconds * 1000) / 3,
    );

    try {
      const ctx: StageContext = {
        projectId: project.id,
        projectTitle: project.title,
        stage: project.currentStage,
        brief: project.brief,
        mode: project.settings.mode,
        settings: project.settings,
        attempts: project.attempts,
        planningCycle: project.planningCycle ?? 1,
        store: this.store,
        log: async (message, data) => {
          console.error(`${prefix} ${message}`);
          await this.store.appendLog({
            projectId: project.id,
            stage: project.currentStage,
            level: "info",
            message,
            data,
          });
        },
        progress: async (percent, label) => {
          const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
          console.error(`${prefix} ${label} — ${boundedPercent}%`);
          await this.store.appendLog({
            projectId: project.id,
            stage: project.currentStage,
            level: "info",
            message: label,
            data: { kind: "stage-progress", label, percent: boundedPercent },
          });
        },
        emitArtifact: async (type, data, provenance) => {
          console.error(`${prefix} storing ${type}`);
          await this.store.appendArtifact({
            projectId: project.id,
            type,
            data,
            // Provenance comes from the stage, because only the stage knows which
            // prompt it used and which inputs it resolved. The runner just records it.
            promptHash: provenance.promptHash,
            inputsHash: provenance.inputsHash,
            planningCycle: project.planningCycle ?? 1,
          });
          console.error(`${prefix} stored ${type}`);
        },
      };

      const result = await handler.run(ctx);

      if (result.kind !== "failed") await ctx.progress(100, "Done");

      if (result.kind === "advance") {
        // The handler does not decide what comes next — the machine does, from the
        // pure shared transition table. Handlers stay independent and ignorant of
        // each other, which is what lets any of them be rerun in isolation.
        const next = nextStage(project.currentStage, project.settings.mode);
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next,
        });
        console.error(`${prefix} completed → ${next}`);
      } else if (result.kind === "route") {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next: result.next,
        });
        console.error(`${prefix} routed → ${result.next}`);
      } else if (result.kind === "questions") {
        const next = result.hasQuestions ? "WaitingForAnswers" : "GeneratingSpecification";
        await this.store.commitResult(project.id, this.workerId, {
          kind: "advance",
          next,
        });
        console.error(`${prefix} completed → ${next}`);
      } else if (result.kind === "wixProvisioned") {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "wixProvisioned",
          next: "GeneratingCode",
          wix: result.wix,
          github: result.github,
        });
        console.error(`${prefix} completed → GeneratingCode`);
      } else if (result.kind === "codeGenerated") {
        const next = nextStage(project.currentStage, project.settings.mode);
        await this.store.commitResult(project.id, this.workerId, {
          kind: "codeGenerated",
          next,
          github: result.github,
        });
        console.error(`${prefix} completed → ${next}`);
      } else if (result.kind === "manualTasks") {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "manualTasks",
          tasks: result.tasks,
        });
        console.error(
          `${prefix} completed → WaitingForManualActions (${result.tasks.length} tasks)`,
        );
      } else {
        console.error(`${prefix} failed — ${result.error}`);
        await this.store.commitResult(project.id, this.workerId, {
          kind: "failed",
          error: result.error,
          retryable: result.retryable,
        });
        console.error(`${prefix} failure recorded; stage is ready to retry`);
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
          retryable: project.currentStage !== "GeneratingCode",
        });
        console.error(`${prefix} failure recorded; stage is ready to retry`);
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
