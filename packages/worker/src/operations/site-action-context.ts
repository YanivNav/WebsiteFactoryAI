import type { Artifact, ArtifactData, ArtifactType } from "@factory/shared";
import type { ArtifactAsset } from "../server";
import type {
  BuildContext,
  LeasedSiteAction,
  ServerAccess,
  SiteActionCompletion,
} from "../server";

/**
 * A {@link BuildContext} backed by site-action endpoints. Pass this to the
 * same services (CodeGenerator, WixService) that pipeline handlers use — no
 * casts needed because the services accept {@link BuildContext}.
 */
export class SiteActionContext implements BuildContext {
  constructor(
    public readonly action: LeasedSiteAction,
    public readonly workerId: string,
    private readonly server: ServerAccess,
  ) {}

  get projectId() {
    return this.action.projectId;
  }

  log(level: "info" | "warn" | "error", message: string): void {
    const prefix = `[${this.action.projectTitle}] [${this.action.type}] `;
    const writer =
      level === "info" ? console.log : level === "warn" ? console.warn : console.error;
    writer(prefix + message);
    void this.server.appendSiteActionLog({
      projectId: this.action.projectId,
      siteActionId: this.action.id,
      level,
      message,
    });
  }

  /** Resolve a storage id to a download URL. */
  getFileUrl(storageId: string): Promise<string | null> {
    return this.server.getFileUrl(storageId);
  }

  /** No-op: site actions don't stream progress to the work timeline. */
  progress(_percent: number, _message: string, _data?: unknown): void {}

  /** Fetch any artifact of the project by id, checking its type. */
  async getArtifact<T extends ArtifactType>(
    type: T,
    artifactId: string,
  ): Promise<import("@factory/shared").Artifact<T> | null> {
    const artifact = await this.server.getArtifact<T>(this.action.projectId, artifactId);
    if (!artifact || artifact.type !== type) return null;
    return artifact;
  }

  /** Add an output artifact against this site action. */
  addArtifact<T extends ArtifactType>(
    outputKey: string,
    type: T,
    data: ArtifactData<T>,
    basedOnArtifactId?: string,
    assets?: ArtifactAsset[],
  ): Promise<Artifact<T>> {
    return this.server.addSiteActionArtifact({
      projectId: this.action.projectId,
      siteActionId: this.action.id,
      workerId: this.workerId,
      outputKey,
      type,
      data,
      basedOnArtifactId,
      assets,
    });
  }

  /** Upload a blob to file storage. */
  async uploadBlob(bytes: Uint8Array, contentType: string): Promise<string> {
    const uploadUrl = await this.server.generateSiteActionUploadUrl(
      this.action.id,
      this.workerId,
    );
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    if (!response.ok) throw new Error(`Blob upload failed: ${response.status}`);
    const { storageId } = (await response.json()) as { storageId: string };
    return storageId;
  }
}

export type SiteActionHandler = (
  action: LeasedSiteAction,
  workerId: string,
  server: ServerAccess,
) => Promise<SiteActionCompletion>;
