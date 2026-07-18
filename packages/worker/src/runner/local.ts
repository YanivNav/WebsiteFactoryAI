import type { JobRunner } from ".";
import type { ServerAccess } from "../server";
import { WorkContext } from "../operations/context";
import { getHandler } from "../operations";

export class LocalRunner implements JobRunner {
  constructor(
    private readonly server: ServerAccess,
    private readonly workerId: string,
    private readonly leaseTtlSeconds: number,
  ) {}

  async tick(): Promise<boolean> {
    const work = await this.server.leaseNextWork(this.workerId, this.leaseTtlSeconds);
    if (!work) return false;

    const operation = work.instruction.type;
    const prefix = `[${work.projectTitle}] [${operation}]`;
    const handler = getHandler(operation);
    if (!handler) {
      const error = `No handler registered for ${operation}`;
      console.error(`${prefix} ${error}`);
      await this.server.failWork(work.id, this.workerId, error);
      return true;
    }

    console.error(`${prefix} leased — attempt ${work.attempt}`);
    const renew = setInterval(
      () => {
        void this.server
          .renewLease(work.id, this.workerId)
          .catch((error) => console.error(`${prefix} lease renewal failed`, error));
      },
      (this.leaseTtlSeconds * 1000) / 3,
    );

    try {
      const completion = await handler.run(new WorkContext(work, this.workerId, this.server));
      await this.server.completeWork(work.id, this.workerId, completion);
      console.error(`${prefix} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = error instanceof Error ? error.stack : undefined;
      console.error(`${prefix} threw — ${message}`, error);
      try {
        await this.server.failWork(work.id, this.workerId, message, details);
      } catch (commitError) {
        console.error(`${prefix} could not record failure; lease must expire`, commitError);
      }
    } finally {
      clearInterval(renew);
    }

    return true;
  }
}
