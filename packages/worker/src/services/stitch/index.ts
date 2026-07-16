import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import type { Design, Specification } from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";

export interface DesignInput {
  specification: Specification;
  feedback: string[];
  previousDesign?: Design;
  screenRevisions?: Array<{
    screenId: string;
    pageTitle: string;
    comment: string;
    action: "replace" | "add" | "regenerate";
    targetPageTitle: string;
    targetPagePath: string;
  }>;
}

export interface GeneratedScreen {
  pageTitle: string;
  pagePath: string;
  viewport: "desktop";
  stitchScreenId: string;
  replacesScreenId?: string;
  html: Uint8Array;
  htmlContentType: string;
  screenshot: Uint8Array;
  screenshotContentType: string;
}

export interface GeneratedDesign {
  stitchProjectId: string;
  screens: GeneratedScreen[];
  promptHash: string;
}

/**
 * Explicit lifecycle events, not log messages. The stage handler decides what to do
 * with each one (persist progress, store blobs, narrate) — the service never knows
 * about the store, and no consumer ever parses a message to find out what happened.
 */
export interface DesignCallbacks {
  onProgress?: (message: string) => Promise<void>;
  onScreenStart?: (
    screen: { pageTitle: string; pagePath: string },
    index: number,
    total: number,
  ) => Promise<void>;
  onScreenReady?: (screen: GeneratedScreen, index: number, total: number) => Promise<void>;
}

export interface DesignGenerator {
  generate(input: DesignInput, callbacks?: DesignCallbacks): Promise<GeneratedDesign>;
}

async function download(url: string, fallbackContentType: string) {
  if (!url) throw new Error("Stitch did not provide an asset URL");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Stitch asset download failed (${response.status})`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] ?? fallbackContentType,
  };
}

async function waitForAssetUrl(getUrl: () => Promise<string>, assetName: "HTML" | "screenshot") {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const url = await getUrl();
    if (url) return url;
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error(`Stitch finished the screen but did not provide its ${assetName} file`);
}

function fullSizeScreenshotUrl(url: string) {
  if (!url.includes("googleusercontent.com")) return url;
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname.replace(/=[^/]+$/, "")}=w2400`;
  return parsed.toString();
}

export class StitchDesignGenerator implements DesignGenerator {
  async generate(input: DesignInput, callbacks: DesignCallbacks = {}): Promise<GeneratedDesign> {
    const onProgress = callbacks.onProgress ?? (async () => undefined);
    const onScreenStart = callbacks.onScreenStart ?? (async () => undefined);
    const onScreenReady = callbacks.onScreenReady ?? (async () => undefined);
    const apiKey = process.env.STITCH_API_KEY;
    if (!apiKey) throw new Error("STITCH_API_KEY is not configured");
    const basePrompt = loadPrompt("design");
    // A client owns exactly one MCP transport. Never reuse the SDK singleton across
    // worker attempts: if the remote closes its socket, reconnecting that Protocol
    // instance throws "Already connected to a transport". A fresh client makes the
    // worker's existing stage retry a genuinely clean retry.
    const client = new StitchToolClient({ apiKey, timeout: 300_000 });
    const sdk = new Stitch(client);
    try {
      await onProgress("Connecting to Stitch");
      const targetedRevision = Boolean(input.previousDesign && input.screenRevisions?.length);
      const project = targetedRevision
        ? sdk.project(input.previousDesign!.stitchProjectId)
        : await sdk.createProject(
            `Website design — ${input.specification.pages[0]?.title ?? "Site"}`,
          );
      if (targetedRevision) {
        await onProgress(
          `Revising ${input.screenRevisions!.length} selected ${input.screenRevisions!.length === 1 ? "screen" : "screens"}`,
        );
        const screens: GeneratedScreen[] = [];
        for (const [index, revision] of input.screenRevisions!.entries()) {
          const previousScreen = input.previousDesign!.screens.find(
            (screen) => screen.stitchScreenId === revision.screenId,
          );
          if (!previousScreen)
            throw new Error(`Screen ${revision.pageTitle} is no longer available`);
          await onScreenStart(
            { pageTitle: revision.targetPageTitle, pagePath: revision.targetPagePath },
            index,
            input.screenRevisions!.length,
          );
          await onProgress(`Revising ${revision.targetPageTitle}`);
          const edited =
            revision.action === "add" || revision.action === "regenerate"
              ? await project.generate(
                  [
                    revision.action === "add"
                      ? `Create an additional screen related to the existing ${previousScreen.pageTitle} screen.`
                      : `Regenerate the ${previousScreen.pageTitle} screen from scratch as a replacement for it.`,
                    `Show this requested UI state: ${revision.comment}`,
                    `The resulting screen is titled "${revision.targetPageTitle}" and represents route ${revision.targetPagePath}.`,
                    revision.action === "add"
                      ? "Keep the same visual system and content context. Do not replace or redesign the original screen."
                      : "Keep the site's visual system and content context, but do not preserve the old screen layout merely for consistency.",
                  ].join("\n"),
                  "DESKTOP",
                  "GEMINI_3_PRO",
                )
              : await project
                  .screen(revision.screenId)
                  .edit(revision.comment, "DESKTOP", "GEMINI_3_PRO");
          const [html, screenshot] = await Promise.all([
            waitForAssetUrl(() => edited.getHtml(), "HTML").then((url) =>
              download(url, "text/html"),
            ),
            waitForAssetUrl(() => edited.getImage(), "screenshot").then((url) =>
              download(fullSizeScreenshotUrl(url), "image/png"),
            ),
          ]);
          const generatedScreen: GeneratedScreen = {
            pageTitle: revision.targetPageTitle,
            pagePath: revision.targetPagePath,
            viewport: "desktop",
            stitchScreenId: edited.id,
            replacesScreenId: revision.action === "add" ? undefined : revision.screenId,
            html: html.bytes,
            htmlContentType: html.contentType,
            screenshot: screenshot.bytes,
            screenshotContentType: screenshot.contentType,
          };
          screens.push(generatedScreen);
          await onScreenReady(generatedScreen, index, input.screenRevisions!.length);
        }
        return { stitchProjectId: project.id, screens, promptHash: basePrompt.hash };
      }
      await onProgress(
        `Stitch project created; generating ${input.specification.pages.length} screens`,
      );
      const screens: GeneratedScreen[] = [];

      for (const [index, page] of input.specification.pages.entries()) {
        await onScreenStart(
          { pageTitle: page.title, pagePath: page.path },
          index,
          input.specification.pages.length,
        );
        await onProgress(
          `Generating desktop screen ${index + 1}/${input.specification.pages.length}: ${page.title}`,
        );
        const generationPrompt = [
          basePrompt.text,
          `Approved site plan:\n${JSON.stringify(input.specification, null, 2)}`,
          `Page to design:\n${JSON.stringify(page, null, 2)}`,
          input.feedback.length > 0
            ? `Changes requested on the previous design:\n${input.feedback.map((item) => `- ${item}`).join("\n")}`
            : "This is the first design version; there is no prior feedback.",
        ].join("\n\n");
        const screen = await project.generate(generationPrompt, "DESKTOP", "GEMINI_3_PRO");
        const [html, screenshot] = await Promise.all([
          waitForAssetUrl(() => screen.getHtml(), "HTML").then((url) => download(url, "text/html")),
          waitForAssetUrl(() => screen.getImage(), "screenshot").then((url) =>
            download(fullSizeScreenshotUrl(url), "image/png"),
          ),
        ]);
        await onProgress(`Received desktop screen: ${page.title}`);
        const generatedScreen = {
          pageTitle: page.title,
          pagePath: page.path,
          viewport: "desktop",
          stitchScreenId: screen.id,
          html: html.bytes,
          htmlContentType: html.contentType,
          screenshot: screenshot.bytes,
          screenshotContentType: screenshot.contentType,
        } satisfies GeneratedScreen;
        screens.push(generatedScreen);
        await onScreenReady(generatedScreen, index, input.specification.pages.length);
      }

      return { stitchProjectId: project.id, screens, promptHash: basePrompt.hash };
    } finally {
      // The remote may already have closed its socket after returning the final
      // screen. Never let transport cleanup hold the completed stage open forever.
      await Promise.race([
        client.close().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }
}
