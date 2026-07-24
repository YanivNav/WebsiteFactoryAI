import type { JobRunner } from ".";
import type { ServerAccess } from "../server";
import { WorkContext } from "../operations/context";
import { getHandler } from "../operations";
import { getSiteActionHandler } from "../operations/site-actions";

export class LocalRunner implements JobRunner {
  constructor(
    private readonly server: ServerAccess,
    private readonly workerId: string,
    private readonly leaseTtlSeconds: number,
  ) {}

  async tick(): Promise<boolean> {
    const work = await this.server.leaseNextWork(this.workerId, this.leaseTtlSeconds);
    if (work) {
      await this.runWork(work);
      return true;
    }

    const action = await this.server.leaseNextSiteAction(this.workerId, this.leaseTtlSeconds);
    if (action) {
      await this.runSiteAction(action);
      return true;
    }

    return false;
  }

  private async runWork(
    work: NonNullable<Awaited<ReturnType<ServerAccess["leaseNextWork"]>>>,
  ) {
    const prefix = `[${work.projectTitle}] [${work.instruction.type}]`;
    const handler = getHandler(work.instruction.type);
    if (!handler) {
      console.error(`${prefix} No handler registered`);
      await this.server.failWork(work.id, this.workerId, `No handler for ${work.instruction.type}`);
      return;
    }

    console.error(`${prefix} leased — attempt ${work.attempt}`);
    const renew = setInterval(
      () => void this.server.renewLease(work.id, this.workerId).catch(() => {}),
      (this.leaseTtlSeconds * 1000) / 3,
    );

    try {
      const completion = await handler.run(new WorkContext(work, this.workerId, this.server));
      await this.server.completeWork(work.id, this.workerId, completion);
      console.error(`${prefix} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} threw — ${message}`, error);
      try {
        await this.server.failWork(work.id, this.workerId, message, (error as Error).stack);
      } catch {}
    } finally {
      clearInterval(renew);
    }
  }

  private async runSiteAction(
    action: NonNullable<Awaited<ReturnType<ServerAccess["leaseNextSiteAction"]>>>,
  ) {
    const prefix = `[${action.projectTitle}] [site-${action.type}]`;
    const handler = getSiteActionHandler(action.type);
    if (!handler) {
      console.error(`${prefix} No handler registered`);
      await this.server.failSiteAction(action.id, this.workerId, "Unknown site action type");
      return;
    }

    console.error(`${prefix} leased`);
    try {
      const completion = await handler(action, this.workerId, this.server);
      await this.server.completeSiteAction(action.id, this.workerId, completion);
      console.error(`${prefix} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} threw — ${message}`, error);
      try {
        await this.server.failSiteAction(
          action.id,
          this.workerId,
          message,
          (error as Error).stack,
        );
      } catch {}
    }
  }
}
