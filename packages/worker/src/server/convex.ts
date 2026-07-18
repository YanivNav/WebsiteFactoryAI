import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Artifact, ArtifactType } from "@factory/shared";
import type { LeasedWork, ServerAccess, WorkCompletion, WorkId } from ".";

const mutation = (name: string) => makeFunctionReference<"mutation">(name);
const query = (name: string) => makeFunctionReference<"query">(name);

const functions = {
  leaseNextWork: mutation("worker:leaseNextWork"),
  renewLease: mutation("worker:renewLease"),
  completeWork: mutation("worker:completeWork"),
  failWork: mutation("worker:failWork"),
  appendLog: mutation("worker:appendLog"),
  appendProgress: mutation("worker:appendProgress"),
  getArtifact: query("worker:getArtifact"),
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

  async leaseNextWork(workerId: string, ttlSeconds: number): Promise<LeasedWork | null> {
    return (await this.client.mutation(functions.leaseNextWork, {
      workerId,
      ttlSeconds,
    })) as LeasedWork | null;
  }

  async renewLease(workId: WorkId, workerId: string): Promise<void> {
    await this.client.mutation(functions.renewLease, {
      workId,
      workerId,
      ttlSeconds: this.leaseTtlSeconds,
    });
  }

  async completeWork(workId: WorkId, workerId: string, completion: WorkCompletion): Promise<void> {
    await this.client.mutation(functions.completeWork, { workId, workerId, completion });
  }

  async failWork(
    workId: WorkId,
    workerId: string,
    error: string,
    technicalDetails?: string,
  ): Promise<void> {
    await this.client.mutation(functions.failWork, {
      workId,
      workerId,
      error,
      technicalDetails,
    });
  }

  async appendLog(input: Parameters<ServerAccess["appendLog"]>[0]): Promise<void> {
    await this.client.mutation(functions.appendLog, input);
  }

  async appendProgress(input: Parameters<ServerAccess["appendProgress"]>[0]): Promise<void> {
    await this.client.mutation(functions.appendProgress, input);
  }

  async getArtifact<T extends ArtifactType>(
    projectId: string,
    artifactId: string,
  ): Promise<Artifact<T> | null> {
    return this.client.query(functions.getArtifact, { projectId, artifactId });
  }

  async addArtifact<T extends ArtifactType>(
    input: Parameters<ServerAccess["addArtifact"]>[0],
  ): Promise<Artifact<T>> {
    return this.client.mutation(functions.addArtifact, input) as Promise<Artifact<T>>;
  }
}
