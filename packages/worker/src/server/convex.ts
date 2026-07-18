/** Convex adapter for the worker's small scheduling-focused persistence port. */
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Artifact, ArtifactData, ArtifactType, Stage } from "@factory/shared";
import type { CommittedResult, LeasedProject, ProjectId, ServerAccess } from ".";

const mutation = (name: string) => makeFunctionReference<"mutation">(name);
const query = (name: string) => makeFunctionReference<"query">(name);

const functions = {
  leaseNextRunnable: mutation("worker:leaseNextRunnable"),
  renewLease: mutation("worker:renewLease"),
  commitResult: mutation("worker:commitResult"),
  appendLog: mutation("worker:appendLog"),
  getCurrentArtifact: query("worker:getCurrentArtifact"),
  getArtifact: query("worker:getArtifact"),
  setProgress: mutation("worker:setProgress"),
  addArtifact: mutation("worker:addArtifact"),
} as const;

export class ConvexServer implements ServerAccess {
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

  async getCurrentArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    type: T,
  ): Promise<Artifact<T> | null> {
    return this.client.query(functions.getCurrentArtifact, {
      projectId,
      type,
    });
  }

  async getArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    artifactId: string,
  ): Promise<Artifact<T> | null> {
    return this.client.query(functions.getArtifact, {
      projectId,
      artifactId,
    });
  }

  async setProgress(projectId: ProjectId, percent: number): Promise<void> {
    await this.client.mutation(functions.setProgress, {
      projectId,
      progress: percent,
    });
  }

  addArtifact<T extends ArtifactType>(
    projectId: ProjectId,
    type: T,
    data: ArtifactData<T>,
    sourceArtifactId?: string,
    generationRequestId?: string,
  ): Promise<Artifact<T>> {
    return this.client.mutation(functions.addArtifact, {
      projectId,
      type,
      data,
      ...(sourceArtifactId ? { sourceArtifactId } : {}),
      ...(generationRequestId ? { generationRequestId } : {}),
    });
  }
}
