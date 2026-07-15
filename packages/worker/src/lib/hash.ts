/**
 * Provenance hashing.
 *
 * Every artifact records the hash of the prompt that produced it and the hash of the
 * inputs it was produced from. Until now both were the literal string "fake", which
 * means "every stage is deterministic from its inputs" was a claim we had no way to
 * check. These make it checkable:
 *
 *   same inputsHash + same promptHash + different output  →  something is leaking
 *
 * That is the entire point. The hashes are not decoration, they are the detector.
 */

import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash a stage's resolved inputs.
 *
 * Stable by construction: object keys are sorted, so `{ a, b }` and `{ b, a }` hash
 * identically. If key order changed the hash, the detector above would fire on noise
 * and you would learn to ignore it — which is worse than not having it.
 */
export function hashInputs(inputs: unknown): string {
  return sha256(stableStringify(inputs));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}
