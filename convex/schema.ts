/**
 * Convex is the state store, and it is the ONLY source of truth.
 *
 * It is not the worker. Convex actions have execution limits and no filesystem,
 * while code generation needs git, `npm install`, `wix build`, and an agent loop
 * over real files. So: Convex persists state and queues work; a separate Node
 * process leases that work and does it.
 *
 * What lives here is *durable input* — brief, specification, design, approvals,
 * stage. The generated repository is *derived state*: a function of
 * (specification + design + config), reconstructible at any time. Losing a
 * workspace loses a cache, not a project.
 *
 * The application must survive refreshes, restarts, and interruptions, because all
 * progress lives here and never in memory.
 *
 * PHASE 0: empty. The tables below are the Phase 1 target, written out so the shape
 * is agreed before a single mutation exists.
 */

import { defineSchema } from "convex/server";

export default defineSchema({
  // TODO(phase-1): define these tables.
  //
  // projects        title, owner, status, currentStage, brief,
  //                 settings { mode, publishTarget, businessName, siteTemplate, solutions[] },
  //                 wix { projectId, siteId, liveUrl, previewUrl },
  //                 lease { workerId, expiresAt },   ← atomic; prevents double-execution
  //                 attempts, lastError, createdAt, updatedAt
  //
  // artifacts       projectId, type, version, data, storageId?,
  //                 promptHash, inputsHash, createdAt
  //                 ← append-only. NEVER overwrite. Rejection produces v2, not a mutation.
  //
  // reviews         projectId, artifactId, artifactType, version, status,
  //                 comments[], approvedBy, approvedAt
  //
  // manualTasks     projectId, stage, title, description, wixDashboardUrl,
  //                 blocking, completed, completedAt
  //
  // changeRequests  projectId, description, status, createdAt
  //                 ← the collaboration queue. Serialized by the worker's lease,
  //                   so two people on two computers can never conflict.
  //
  // logs            projectId, stage, level, message, data, timestamp
  //                 ← structured. The user-facing feed is DERIVED from these;
  //                   never rely on raw AI messages for state.
  //
  // stageRuns       projectId, stage, attempt, status, startedAt, finishedAt, error
});
