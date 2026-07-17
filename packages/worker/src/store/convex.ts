/** Convex adapter for the worker's small scheduling-focused persistence port. */
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Stage } from "@factory/shared";
import type { CommittedResult, LeasedProject, ProjectId, ProjectStore } from ".";

const mutation = (name: string) => makeFunctionReference<"mutation">(name);

const functions = {
  leaseNextRunnable: mutation("worker:leaseNextRunnable"),
  renewLease: mutation("worker:renewLease"),
  commitResult: mutation("worker:commitResult"),
  appendLog: mutation("worker:appendLog"),
} as const;

export class ConvexProjectStore implements ProjectStore {
  private readonly client: ConvexHttpClient;

  constructor(
    url: string,
    private readonly leaseTtlSeconds: number,
  ) {
    this.client = new ConvexHttpClient(url);
  }

  async leaseNextRunnable(workerId: string, ttlSeconds: number): Promise<LeasedProject | null> {
    return (await this.client.mutation(functions.leaseNextRunnable, {
      workerId,
      ttlSeconds,
    })) as LeasedProject | null;
  }

  async renewLease(projectId: ProjectId, workerId: string): Promise<void> {
    await this.client.mutation(functions.renewLease, {
      projectId,
      workerId,
      ttlSeconds: this.leaseTtlSeconds,
    });
  }

  async commitResult(
    projectId: ProjectId,
    workerId: string,
    result: CommittedResult,
  ): Promise<void> {
    await this.client.mutation(functions.commitResult, { projectId, workerId, result });
  }

  async appendLog(input: {
    projectId: ProjectId;
    stage: Stage;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    await this.client.mutation(functions.appendLog, input);
  }
}
