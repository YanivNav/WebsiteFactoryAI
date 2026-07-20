import type { Artifact, ArtifactData, ArtifactType, WorkOperation } from "@factory/shared";
import type {
  ArtifactAsset,
  ArtifactInput,
  LeasedWork,
  ScreenRevisionRequest,
  ServerAccess,
} from "../server";

type InputArtifactType<
  K extends WorkOperation,
  N extends keyof LeasedWork<K>["instruction"]["inputs"],
> = LeasedWork<K>["instruction"]["inputs"][N] extends { artifactType: infer T extends ArtifactType }
  ? T
  : never;

export class WorkContext<K extends WorkOperation = WorkOperation> {
  constructor(
    public readonly work: LeasedWork<K>,
    private readonly workerId: string,
    private readonly server: ServerAccess,
  ) {}

  log(level: "info" | "error" | "warn", message: string): void {
    const prefix = `[${this.work.projectId}] [${this.work.instruction.type}] `;
    const writer = level === "info" ? console.log : level === "warn" ? console.warn : console.error;
    writer(prefix + message);
    void this.server.appendLog({
      projectId: this.work.projectId,
      workId: this.work.id,
      attempt: this.work.attempt,
      level,
      message,
    });
  }

  async progress(percent: number, message: string, data?: unknown): Promise<void> {
    this.log("info", message);
    await this.server.appendProgress({
      projectId: this.work.projectId,
      workId: this.work.id,
      workerId: this.workerId,
      attempt: this.work.attempt,
      percent,
      message,
      data,
    });
  }

  /** Upload a blob (e.g. a screenshot or HTML file) to file storage. */
  uploadBlob(bytes: Uint8Array, contentType: string): Promise<string> {
    return this.server.uploadBlob(this.work.id, this.workerId, bytes, contentType);
  }

  /** Resolve a storage id to a download URL. */
  getFileUrl(storageId: string): Promise<string | null> {
    return this.server.getFileUrl(storageId);
  }

  /** Per-screen revision requests raised by the user while this work is running. */
  claimScreenRevisions(): Promise<ScreenRevisionRequest[]> {
    return this.server.claimScreenRevisions(this.work.id, this.workerId);
  }

  async getInput<N extends keyof LeasedWork<K>["instruction"]["inputs"] & string>(
    name: N,
  ): Promise<Artifact<InputArtifactType<K, N>>> {
    const inputs = this.work.instruction.inputs as Record<string, ArtifactInput<ArtifactType>>;
    const input = inputs[name];
    if (!input || input.source !== "artifact") throw new Error(`Missing ${name} input`);
    const artifact = await this.server.getArtifact<InputArtifactType<K, N>>(
      this.work.projectId,
      input.artifactId,
    );
    if (!artifact || artifact.type !== input.artifactType) {
      throw new Error(`Invalid ${name} input`);
    }
    return artifact;
  }

  async getRevisionBase<T extends ArtifactType>(type: T): Promise<Artifact<T> | null> {
    const artifactId = this.work.instruction.revision?.baseArtifactId;
    if (!artifactId) return null;
    const artifact = await this.server.getArtifact<T>(this.work.projectId, artifactId);
    if (!artifact || artifact.type !== type) throw new Error("Invalid revision base");
    return artifact;
  }

  addArtifact<T extends ArtifactType>(
    outputKey: string,
    type: T,
    data: ArtifactData<T>,
    basedOnArtifactId?: string,
    assets?: ArtifactAsset[],
  ): Promise<Artifact<T>> {
    return this.server.addArtifact({
      projectId: this.work.projectId,
      workId: this.work.id,
      workerId: this.workerId,
      outputKey,
      type,
      data,
      basedOnArtifactId,
      assets,
    });
  }
}
