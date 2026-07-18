import type {LeasedProject, ServerAccess} from "../server";
import type {Artifact, ArtifactData, ArtifactType, Stage} from "@factory/shared";


export class StageContext {
  constructor(public project: LeasedProject, private server: ServerAccess, public stage: Stage) {
  }

  log(level: 'info' | 'error' | 'warn', message: string): void {
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
      stage: this.stage
    });
  }

  progress(percent: number, message?: string): void {
    if (message) {
      this.log('info', message);
    }
    this.server.setProgress(this.project.id, percent);
  }

  async getLatestArtifact<T extends ArtifactType>(type: T): Promise<Artifact<T> | null> {
    return this.server.getLatestArtifact(this.project.id, type);
  }

  async addArtifact<T extends ArtifactType>(type: T, data: ArtifactData<T>): Promise<Artifact<T>> {
    return this.server.addArtifact(this.project.id, type, data);
  }

  updateArtifact<T extends ArtifactType>(id: string, data: ArtifactData<T>): Promise<Artifact<T>> {
    return this.server.updateArtifact(id, data);
  }
}