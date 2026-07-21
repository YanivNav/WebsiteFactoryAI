import { buildFifeSuffix, stitch, type Project } from "@google/stitch-sdk";
import type {WorkContext} from "../operations/context";

/** Requested screenshot width from Stitch's image serving (FIFE). */
const SCREENSHOT_WIDTH = 1600;

export type StitchDeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
type StitchModelId = "GEMINI_3_PRO" | "GEMINI_3_FLASH" | "GEMINI_3_1_PRO";

export interface GeneratedScreen {
  html: Uint8Array;
  htmlContentType: string;
  image: Uint8Array;
  imageContentType: string;
}

function model(): StitchModelId {
  const configured = process.env.STITCH_MODEL;
  if (
    configured === "GEMINI_3_PRO" ||
    configured === "GEMINI_3_FLASH" ||
    configured === "GEMINI_3_1_PRO"
  ) {
    return configured;
  }
  return "GEMINI_3_FLASH";
}

async function downloadBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!url) throw new Error("Stitch returned an empty asset URL");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Stitch asset download failed: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

/**
 * Thin wrapper over `@google/stitch-sdk` (auth via `STITCH_API_KEY`). One project
 * per generation run; each `generateScreen` produces a screen and downloads its
 * HTML + screenshot (the SDK returns download URLs) as bytes for file storage.
 */
export class StitchService {
  private project: Project | null = null;

  /** Create a fresh Stitch project. Returns its ID. */
  async createProject(ctx: WorkContext): Promise<string> {
    ctx.log("info", "Creating stitch project: " + ctx.work.projectTitle);
    this.project = await stitch.createProject(ctx.work.projectTitle);
    return this.project.projectId;
  }

  /** Load an existing Stitch project by ID — no API call. */
  loadProject(id: string): void {
    this.project = stitch.project(id);
  }

  getProjectId(): string | null {
    return this.project?.projectId ?? null;
  }

  async generateScreen(
    ctx: WorkContext,
    prompt: string,
    deviceType: StitchDeviceType = "DESKTOP",
  ): Promise<GeneratedScreen> {
    if (!this.project) throw new Error("Create or load a Stitch project before generating");
    ctx.log("info", "Generating with google stitch: " + JSON.stringify({ prompt, deviceType }));
    const generated = await this.project.generate(prompt, deviceType, model());
    // Refresh from get_screen so the screenshot reflects the latest state, not
    // whatever was captured mid-generation in the generate_screen_from_text response.
    const screen = await this.project.getScreen(generated.id);
    const [htmlUrl, imageUrl] = await Promise.all([screen.getHtml(), screen.getImage()]);
    const hiresImageUrl = imageUrl + buildFifeSuffix({ width: SCREENSHOT_WIDTH });
    const [html, image] = await Promise.all([downloadBytes(htmlUrl), downloadBytes(hiresImageUrl)]);
    return {
      html: html.bytes,
      htmlContentType: html.contentType.startsWith("text/")
        ? html.contentType
        : "text/html; charset=utf-8",
      image: image.bytes,
      imageContentType: image.contentType,
    };
  }
}
