/**
 * Artifacts are append-only and versioned. Never overwrite — always add a version.
 * `Specification v1, v2, v3…` is the whole point: every generated output is
 * immutable, and rejection produces a new version rather than mutating the old one.
 */

export const ARTIFACT_TYPES = [
  "brief",
  "specification",
  "design",
  "buildReport",
  "preview",
  "releaseReport",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const REVIEW_STATUSES = [
  "waiting",
  "approved",
  "rejected",
  "needs_changes",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The collaboration queue. Serialized by the worker's lease, so merge conflicts
 *  are structurally impossible and conflict resolution never needs to exist. */
export const CHANGE_REQUEST_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export type PublishTarget = "wix-managed" | "custom";

// TODO(phase-3): the Specification shape (schema-constrained OpenAI output).
// TODO(phase-4): the Design shape (Stitch screens: HTML + screenshot per screen).
// Deliberately not implemented during scaffolding.
