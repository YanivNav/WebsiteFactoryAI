/**
 * A deliberate pause for exercising the worker loop and crash recovery before any
 * real stage implementation exists.
 */
const FAKE_WORK_MS = Number(process.env.FAKE_WORK_MS ?? 1000);

export async function fakeWork(ms: number = FAKE_WORK_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
