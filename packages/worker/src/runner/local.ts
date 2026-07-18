/**
 * Local execution loop: lease one project, renew its lease while working, run one
 * handler, and atomically commit the outcome with lease release.
 */
import { nextStage } from "@factory/shared";
import type { JobRunner } from ".";
import { HANDLERS } from "../stages";
import type {ServerAccess} from "../server";
import {StageContext} from "../stages/context";

export class LocalRunner implements JobRunner {
  constructor(
    private readonly server: ServerAccess,
    private readonly workerId: string,
    private readonly leaseTtlSeconds: number,
  ) {}

  async tick(): Promise<boolean> {
    const project = await this.server.leaseNextRunnable(this.workerId, this.leaseTtlSeconds);
    if (!project) return false;

    const prefix = `[${project.title}] [${project.currentStage}]`;
    const handler = HANDLERS[project.currentStage];

    if (!handler) {
      const error = `No handler registered for ${project.currentStage}`;
      console.error(`${prefix} ${error}`);
      await this.server.commitResult(project.id, this.workerId, {
        kind: "failed",
        error
      });
      return true;
    }

    console.error(`${prefix} leased`);
    const renew = setInterval(
      () => {
        void this.server
          .renewLease(project.id, this.workerId)
          .then(() => console.error(`${prefix} lease renewed`))
          .catch((error) => console.error(`${prefix} lease renewal failed`, error));
      },
      (this.leaseTtlSeconds * 1000) / 3,
    );

    try {
      const context = new StageContext(project, this.server, project.currentStage);

      const result = await handler.run(context);
      if (result.kind === "advance") {
        const next = result.target || nextStage(project.currentStage);
        await this.server.commitResult(project.id, this.workerId, { kind: "advance", next });
        console.error(`${prefix} completed → ${next}`);
      } else {
        await this.server.commitResult(project.id, this.workerId, result);
        console.error(`${prefix} failed — ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} threw — ${message}`);
      try {
        await this.server.commitResult(project.id, this.workerId, {
          kind: "failed",
          error: message
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
