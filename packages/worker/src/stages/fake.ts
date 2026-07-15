/**
 * PHASE 1 ONLY — fake work.
 *
 * These handlers do no real work. They log, take a beat, and emit a canned artifact.
 * That is the entire point: with the stages faked, the state machine is the only
 * thing under test, and a bug in it takes seconds to find instead of hours.
 *
 * The deliberate pause matters — it is what gives us a window to kill the worker
 * MID-STAGE and prove the project resumes. Once the real integrations land in
 * Phases 3–5, these are deleted one at a time.
 */

import type { Provenance } from "./types.js";

// Overridable so the crash/resume test can widen the window and kill the worker
// squarely mid-stage. `FAKE_WORK_MS=10000 pnpm worker` gives you ten seconds to
// pull the plug.
const FAKE_WORK_MS = Number(process.env.FAKE_WORK_MS ?? 2500);

export async function fakeWork(ms: number = FAKE_WORK_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A fake stage has no prompt and no real inputs, so it has no provenance to record.
 *
 * It has to say so explicitly rather than omitting it — an artifact carrying empty
 * hashes is honestly labelled "unverifiable", whereas an artifact carrying *plausible*
 * hashes it did not earn would be a lie the detector can't catch. When a stage becomes
 * real, this import disappears with it.
 */
export const FAKE_PROVENANCE: Provenance = { promptHash: "", inputsHash: "" };
