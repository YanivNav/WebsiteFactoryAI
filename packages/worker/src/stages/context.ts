import type { LeasedProject, ServerAccess } from "../server";
import type { Artifact, ArtifactData, ArtifactType, Stage } from "@factory/shared";

export class StageContext {
  constructor(
    public project: LeasedProject,
    private server: ServerAccess,
    public stage: Stage,
  ) {}

  log(level: "info" | "error" | "warn", message: string): void {
    const prefix = `[${this.project.id}] [${this.project.currentStage}] `;
    switch (level) {
      case "info":
        console.log(prefix + message);
        break;
      case "warn":
        console.warn(prefix + message);
        break;
      case "error":
        console.error(prefix + message);
        break;
    }
    this.server.appendLog({
      level,
      message,
      projectId: this.project.id,
      stage: this.stage,
    });
  }

  progress(percent: number, message?: string): void {
    if (message) {
      this.log("info", message);
    }
    this.server.setProgress(this.project.id, percent);
  }

  async getInputArtifact<T extends ArtifactType>(type: T): Promise<Artifact<T> | null> {
    const artifactId = this.project.generationRequest?.inputs[type];
    if (artifactId) return this.server.getArtifact<T>(this.project.id, artifactId);
    return this.server.getCurrentArtifact(this.project.id, type);
  }

  async getGenerationBase<T extends ArtifactType>(type: T): Promise<Artifact<T> | null> {
    const request = this.project.generationRequest;
    if (!request?.baseArtifactId || request.outputType !== type) return null;
    return this.server.getArtifact<T>(this.project.id, request.baseArtifactId);
  }

  async addArtifact<T extends ArtifactType>(
    type: T,
    data: ArtifactData<T>,
    sourceArtifactId?: string,
  ): Promise<Artifact<T>> {
    const request = this.project.generationRequest;
    const source =
      sourceArtifactId ?? (request?.outputType === type ? request.baseArtifactId : undefined);
    return this.server.addArtifact(this.project.id, type, data, source, request?.id);
  }
}
