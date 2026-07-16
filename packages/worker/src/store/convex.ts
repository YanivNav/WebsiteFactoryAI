/**
 * ConvexProjectStore — the ONLY file in the worker that knows Convex exists.
 *
 * This is the adapter that makes the portability guardrail real: everything else in
 * the worker (the loop, the state machine, every stage handler, every service) talks
 * to the `ProjectStore` port and has no idea what is behind it. Swapping to
 * Neon + Drizzle means writing a sibling of this file. Nothing else moves.
 *
 * If you find yourself importing `convex/*` anywhere else under `packages/worker/`,
 * stop — that is precisely the mistake this arrangement exists to prevent, and it is
 * far cheaper to catch now than after Phase 5.
 */

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { ArtifactType, DesignScreenProgress, ReviewFeedback, Stage } from "@factory/shared";
import type { ArtifactRecord, CommittedResult, LeasedProject, ProjectId, ProjectStore } from ".";

/**
 * The worker lives outside the Convex codebase, so it addresses functions by name
 * rather than through Convex's generated types. Deliberate: the boundary is a
 * contract (`ProjectStore`), not a shared type graph — which is also what stops
 * Convex's generated types from leaking into the rest of the worker.
 *
 * The upside of naming them here: this is the complete, greppable list of everything
 * the worker is allowed to ask the backend for. If it is not in this list, the worker
 * cannot do it.
 */
const mut = (name: string) => makeFunctionReference<"mutation">(name);

const FN = {
  leaseNextRunnable: mut("worker:leaseNextRunnable"),
  renewLease: mut("worker:renewLease"),
  commitResult: mut("worker:commitResult"),
  appendArtifact: mut("worker:appendArtifact"),
  appendLog: mut("worker:appendLog"),
  getLatestArtifact: mut("worker:getLatestArtifact"),
  getLatestApproved: mut("worker:getLatestApproved"),
  generateUploadUrl: mut("worker:generateUploadUrl"),
  getStorageUrl: mut("worker:getStorageUrl"),
  getLatestReviewFeedback: mut("worker:getLatestReviewFeedback"),
  getLatestReviewContext: mut("worker:getLatestReviewContext"),
  consumeLatestReviewFeedback: mut("worker:consumeLatestReviewFeedback"),
  resetDesignProgress: mut("worker:resetDesignProgress"),
  updateDesignProgress: mut("worker:updateDesignProgress"),
  hasBlockingIncompleteTasks: mut("worker:hasBlockingIncompleteTasks"),
  getManualTaskStatuses: mut("worker:getManualTaskStatuses"),
  claimChangeRequest: mut("worker:claimChangeRequest"),
  completeChangeRequest: mut("worker:completeChangeRequest"),
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
    return (await this.client.mutation(FN.leaseNextRunnable, {
      workerId,
      ttlSeconds,
    })) as LeasedProject | null;
  }

  async renewLease(projectId: ProjectId, workerId: string): Promise<void> {
    await this.client.mutation(FN.renewLease, {
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
    await this.client.mutation(FN.commitResult, { projectId, workerId, result });
  }

  async appendArtifact(input: {
    projectId: ProjectId;
    type: ArtifactType;
    data: unknown;
    promptHash: string;
    inputsHash: string;
    planningCycle?: number;
  }): Promise<ArtifactRecord> {
    const res = (await this.client.mutation(FN.appendArtifact, input)) as {
      id: string;
      version: number;
    };
    return {
      id: res.id,
      type: input.type,
      version: res.version,
      data: input.data,
      planningCycle: input.planningCycle,
    };
  }

  async getLatestApproved(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<ArtifactRecord | null> {
    return (await this.client.mutation(FN.getLatestApproved, {
      projectId,
      type,
    })) as ArtifactRecord | null;
  }

  async getLatestArtifact(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<ArtifactRecord | null> {
    return (await this.client.mutation(FN.getLatestArtifact, {
      projectId,
      type,
    })) as ArtifactRecord | null;
  }

  async getLatestReviewFeedback(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<ReviewFeedback[]> {
    return (await this.client.mutation(FN.getLatestReviewFeedback, {
      projectId,
      type,
    })) as ReviewFeedback[];
  }

  async getLatestReviewContext(
    projectId: ProjectId,
    type: ArtifactType,
  ): Promise<{ feedback: ReviewFeedback[]; artifact: ArtifactRecord } | null> {
    return (await this.client.mutation(FN.getLatestReviewContext, {
      projectId,
      type,
    })) as { feedback: ReviewFeedback[]; artifact: ArtifactRecord } | null;
  }

  async consumeLatestReviewFeedback(projectId: ProjectId, type: ArtifactType): Promise<void> {
    await this.client.mutation(FN.consumeLatestReviewFeedback, { projectId, type });
  }

  async resetDesignProgress(projectId: ProjectId, screens: DesignScreenProgress[]): Promise<void> {
    await this.client.mutation(FN.resetDesignProgress, { projectId, screens });
  }

  async updateDesignProgress(projectId: ProjectId, screen: DesignScreenProgress): Promise<void> {
    await this.client.mutation(FN.updateDesignProgress, { projectId, screen });
  }

  async putBlob(bytes: Uint8Array, contentType: string): Promise<string> {
    const uploadUrl = (await this.client.mutation(FN.generateUploadUrl, {})) as string;
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: new Blob([bytes], { type: contentType }),
    });
    if (!response.ok) throw new Error(`Convex storage upload failed (${response.status})`);
    const result = (await response.json()) as { storageId: string };
    return result.storageId;
  }

  async getBlob(storageId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const url = (await this.client.mutation(FN.getStorageUrl, { storageId })) as string | null;
    if (!url) throw new Error("A design file is no longer available");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Design file download failed (${response.status})`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType:
        response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
    };
  }

  async appendLog(input: {
    projectId: ProjectId;
    stage: Stage;
    level: "info" | "warn" | "error";
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Separate table, append-only: writing a log never contends with the dashboard
    // reading `projects`. This is the Convex OCC guardrail, in practice.
    await this.client.mutation(FN.appendLog, input);
  }

  async hasBlockingIncompleteTasks(projectId: ProjectId): Promise<boolean> {
    return (await this.client.mutation(FN.hasBlockingIncompleteTasks, {
      projectId,
    })) as boolean;
  }

  async getManualTaskStatuses(
    projectId: ProjectId,
  ): Promise<Array<{ title: string; completed: boolean; configurationValue?: string }>> {
    return (await this.client.mutation(FN.getManualTaskStatuses, {
      projectId,
    })) as Array<{ title: string; completed: boolean; configurationValue?: string }>;
  }

  async nextQueuedChangeRequest(
    projectId: ProjectId,
  ): Promise<{ id: string; description: string } | null> {
    return (await this.client.mutation(FN.claimChangeRequest, {
      projectId,
    })) as { id: string; description: string } | null;
  }

  async completeChangeRequest(changeRequestId: string, status: "done" | "failed"): Promise<void> {
    await this.client.mutation(FN.completeChangeRequest, {
      changeRequestId,
      status,
    });
  }
}

export type { ArtifactType };
