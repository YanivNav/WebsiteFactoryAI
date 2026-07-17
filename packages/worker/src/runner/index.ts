/** The execution boundary for the background worker. */
export interface JobRunner {
  /** Lease and execute at most one runnable stage. */
  tick(): Promise<boolean>;
}
