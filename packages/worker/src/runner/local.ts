/**
 * Local execution loop: lease one project, renew its lease while working, run one
 * handler, and atomically commit the outcome with lease release.
 */
import { nextStage } from "@factory/shared";
import type { JobRunner } from ".";
import type { ProjectStore } from "../store";
import { HANDLERS, type StageContext } from "../stages";

export class LocalRunner implements JobRunner {
  constructor(
    private readonly store: ProjectStore,
    private readonly workerId: string,
    private readonly leaseTtlSeconds: number,
  ) {}

  async tick(): Promise<boolean> {
    const project = await this.store.leaseNextRunnable(this.workerId, this.leaseTtlSeconds);
    if (!project) return false;

    const prefix = `[worker ${this.workerId}] [project ${project.id}] [${project.currentStage}]`;
    const handler = HANDLERS[project.currentStage];

    if (!handler) {
      const error = `No handler registered for ${project.currentStage}`;
      console.error(`${prefix} ${error}`);
      await this.store.commitResult(project.id, this.workerId, {
        kind: "failed",
        error,
        retryable: false,
      });
      return true;
    }

    console.error(`${prefix} leased`);
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
      const context: StageContext = {
        projectId: project.id,
        projectTitle: project.title,
        stage: project.currentStage,
        brief: project.brief,
        mode: project.settings.mode,
        settings: project.settings,
        attempts: project.attempts,
        store: this.store,
        log: async (message, data) => {
          console.info(`${prefix} ${message}`);
          await this.store.appendLog({
            projectId: project.id,
            stage: project.currentStage,
            level: "info",
            message,
            data,
          });
        },
      };

      const result = await handler.run(context);
      if (result.kind === "advance") {
        const next = nextStage(project.currentStage, project.settings.mode);
        await this.store.commitResult(project.id, this.workerId, { kind: "advance", next });
        console.error(`${prefix} completed → ${next}`);
      } else {
        await this.store.commitResult(project.id, this.workerId, result);
        console.error(`${prefix} failed — ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} threw — ${message}`);
      try {
        await this.store.commitResult(project.id, this.workerId, {
          kind: "failed",
          error: message,
          retryable: true,
        });
      } catch (commitError) {
        console.error(`${prefix} could not record failure; lease must expire`, commitError);
      }
    } finally {
      clearInterval(renew);
    }

    return true;
  }
}
