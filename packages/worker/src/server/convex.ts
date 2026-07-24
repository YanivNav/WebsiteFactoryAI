import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Artifact, ArtifactType } from "@factory/shared";
import type { LeasedSiteAction, LeasedWork, ScreenRevisionRequest, ServerAccess, SiteActionCompletion, WorkCompletion, WorkId } from ".";

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
  updateArtifact: mutation("worker:updateArtifact"),
  generateUploadUrl: mutation("worker:generateUploadUrl"),
  claimScreenRevisions: mutation("worker:claimScreenRevisions"),
  getFileUrl: query("worker:getFileUrl"),
  startDevSession: mutation("worker:startDevSession"),
  updateDevSession: mutation("worker:updateDevSession"),
  appendDevLogs: mutation("worker:appendDevLogs"),
  leaseNextSiteAction: mutation("worker:leaseNextSiteAction"),
  completeSiteAction: mutation("worker:completeSiteAction"),
  failSiteAction: mutation("worker:failSiteAction"),
  appendSiteActionLog: mutation("worker:appendSiteActionLog"),
  addSiteActionArtifact: mutation("worker:addSiteActionArtifact"),
  generateSiteActionUploadUrl: mutation("worker:generateSiteActionUploadUrl"),
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

  async updateArtifact<T extends ArtifactType>(
    input: Parameters<ServerAccess["updateArtifact"]>[0],
  ): Promise<Artifact<T>> {
    return this.client.mutation(functions.updateArtifact, input) as Promise<Artifact<T>>;
  }

  async uploadBlob(
    workId: WorkId,
    workerId: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const uploadUrl = (await this.client.mutation(functions.generateUploadUrl, {
      workId,
      workerId,
    })) as string;
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    if (!response.ok) throw new Error(`Blob upload failed: ${response.status}`);
    const { storageId } = (await response.json()) as { storageId: string };
    return storageId;
  }

  async getFileUrl(storageId: string): Promise<string | null> {
    return this.client.query(functions.getFileUrl, { storageId });
  }

  async claimScreenRevisions(
    workId: WorkId,
    workerId: string,
  ): Promise<ScreenRevisionRequest[]> {
    return (await this.client.mutation(functions.claimScreenRevisions, {
      workId,
      workerId,
    })) as ScreenRevisionRequest[];
  }

  async startDevSession(input: Parameters<ServerAccess["startDevSession"]>[0]): Promise<void> {
    await this.client.mutation(functions.startDevSession, input);
  }

  async updateDevSession(input: Parameters<ServerAccess["updateDevSession"]>[0]): Promise<void> {
    await this.client.mutation(functions.updateDevSession, input);
  }

  async appendDevLogs(input: Parameters<ServerAccess["appendDevLogs"]>[0]): Promise<void> {
    await this.client.mutation(functions.appendDevLogs, input);
  }

  // ---- Site actions ---------------------------------------------------------

  async leaseNextSiteAction(workerId: string, ttlSeconds: number): Promise<LeasedSiteAction | null> {
    return (await this.client.mutation(functions.leaseNextSiteAction, {
      workerId,
      ttlSeconds,
    })) as LeasedSiteAction | null;
  }

  async completeSiteAction(
    siteActionId: string,
    workerId: string,
    completion: SiteActionCompletion,
  ): Promise<void> {
    await this.client.mutation(functions.completeSiteAction, {
      siteActionId,
      workerId,
      ...completion,
    });
  }

  async failSiteAction(
    siteActionId: string,
    workerId: string,
    error: string,
    technicalDetails?: string,
  ): Promise<void> {
    await this.client.mutation(functions.failSiteAction, {
      siteActionId,
      workerId,
      error,
      technicalDetails,
    });
  }

  async appendSiteActionLog(
    input: Parameters<ServerAccess["appendSiteActionLog"]>[0],
  ): Promise<void> {
    await this.client.mutation(functions.appendSiteActionLog, input);
  }

  async addSiteActionArtifact<T extends ArtifactType>(
    input: Parameters<ServerAccess["addSiteActionArtifact"]>[0],
  ): Promise<Artifact<T>> {
    return this.client.mutation(functions.addSiteActionArtifact, input) as Promise<Artifact<T>>;
  }

  async generateSiteActionUploadUrl(siteActionId: string, workerId: string): Promise<string> {
    return (await this.client.mutation(functions.generateSiteActionUploadUrl, {
      siteActionId,
      workerId,
    })) as string;
  }
}
