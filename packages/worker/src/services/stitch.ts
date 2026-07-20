import { stitch, type Project } from "@google/stitch-sdk";

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

  async start(title: string): Promise<void> {
    this.project = await stitch.createProject(title);
  }

  async generateScreen(
    prompt: string,
    deviceType: StitchDeviceType = "DESKTOP",
  ): Promise<GeneratedScreen> {
    if (!this.project) throw new Error("StitchService.start() must be called before generating");
    const screen = await this.project.generate(prompt, deviceType, model());
    const [htmlUrl, imageUrl] = await Promise.all([screen.getHtml(), screen.getImage()]);
    const [html, image] = await Promise.all([downloadBytes(htmlUrl), downloadBytes(imageUrl)]);
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
