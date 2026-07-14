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
import type { ArtifactType, Stage } from "@factory/shared";
import type {
  ArtifactRecord,
  CommittedResult,
  LeasedProject,
  ProjectId,
  ProjectStore,
} from "./index.js";

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
  hasBlockingIncompleteTasks: mut("worker:hasBlockingIncompleteTasks"),
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

  async leaseNextRunnable(
    workerId: string,
    ttlSeconds: number,
  ): Promise<LeasedProject | null> {
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
  }): Promise<ArtifactRecord> {
    const res = (await this.client.mutation(FN.appendArtifact, input)) as {
      id: string;
      version: number;
    };
    return { id: res.id, type: input.type, version: res.version, data: input.data };
  }

  async getLatestApproved(): Promise<ArtifactRecord | null> {
    // TODO(phase-3): needed once stages actually consume upstream artifacts.
    return null;
  }

  async putBlob(): Promise<string> {
    // TODO(phase-4): Stitch HTML + screenshots. Blobs never go inside documents.
    throw new Error("putBlob not implemented until Phase 4");
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

  async nextQueuedChangeRequest(
    projectId: ProjectId,
  ): Promise<{ id: string; description: string } | null> {
    return (await this.client.mutation(FN.claimChangeRequest, {
      projectId,
    })) as { id: string; description: string } | null;
  }

  async completeChangeRequest(
    changeRequestId: string,
    status: "done" | "failed",
  ): Promise<void> {
    await this.client.mutation(FN.completeChangeRequest, {
      changeRequestId,
      status,
    });
  }
}

export type { ArtifactType };
