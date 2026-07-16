"use client";
/* eslint-disable @next/next/no-img-element -- Convex storage URLs are dynamic review assets. */

import { useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { Design } from "@factory/shared";
import { ScreenPreviewModal } from "../ScreenPreviewModal";

type DesignScreen = Design["screens"][number];

/**
 * The design under review, one card per desktop screen. "Describe a change" submits
 * feedback targeted at that specific screen; the design stage revises only it.
 */
export function DesignGallery({
  assetUrls,
  canRevise,
  design,
  onScreenFeedback,
}: {
  assetUrls: Record<string, string | null>;
  canRevise: boolean;
  design: Design;
  onScreenFeedback: (screen: DesignScreen, comment: string) => Promise<unknown>;
}) {
  const [activeScreen, setActiveScreen] = useState<DesignScreen | null>(null);
  const desktopScreens = design.screens.filter((screen) => screen.viewport === "desktop");
  const activeScreenshotUrl = activeScreen ? assetUrls[activeScreen.screenshotStorageId] : null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <span className="border-primary bg-primary rounded border px-3 py-1.5 text-[11px] font-semibold text-white">
            Desktop
          </span>
          <span className="border-outline rounded border bg-[#f1f2f4] px-3 py-1.5 text-[11px] font-semibold text-[#858c98]">
            Mobile · later
          </span>
        </div>
        <span className="text-[11px] text-[#697181]">{desktopScreens.length} screens</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {desktopScreens.map((screen) => (
          <ScreenCard
            canRevise={canRevise}
            htmlUrl={assetUrls[screen.htmlStorageId]}
            key={screen.stitchScreenId}
            onOpen={() => setActiveScreen(screen)}
            onSubmitFeedback={(comment) => onScreenFeedback(screen, comment)}
            screen={screen}
            screenshotUrl={assetUrls[screen.screenshotStorageId]}
          />
        ))}
      </div>
      {activeScreen && activeScreenshotUrl && (
        <ScreenPreviewModal
          imageUrl={activeScreenshotUrl}
          onClose={() => setActiveScreen(null)}
          title={activeScreen.pageTitle}
        />
      )}
    </section>
  );
}

function ScreenCard({
  canRevise,
  htmlUrl,
  onOpen,
  onSubmitFeedback,
  screen,
  screenshotUrl,
}: {
  canRevise: boolean;
  htmlUrl: string | null | undefined;
  onOpen: () => void;
  onSubmitFeedback: (comment: string) => Promise<unknown>;
  screen: DesignScreen;
  screenshotUrl: string | null | undefined;
}) {
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    setSubmitting(true);
    try {
      await onSubmitFeedback(comment.trim());
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <article className="border-outline overflow-hidden rounded border bg-white">
      <button
        className="relative block aspect-[16/10] w-full overflow-hidden bg-[#e7e8e9]"
        onClick={onOpen}
        type="button"
      >
        {screenshotUrl ? (
          <img
            alt={`${screen.pageTitle} desktop design`}
            className="h-full w-full object-contain object-top transition-transform hover:scale-[1.01]"
            src={screenshotUrl}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-[#697181]">
            Screenshot unavailable
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{screen.pageTitle}</h3>
          <code className="text-[10px] text-[#858c98]">{screen.pagePath}</code>
        </div>
        <div className="flex items-center gap-1">
          {canRevise && (
            <button
              className="text-primary rounded px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[#edf5ff]"
              onClick={() => {
                setCommenting((value) => !value);
                setComment("");
              }}
              type="button"
            >
              Describe a change
            </button>
          )}
          {htmlUrl && (
            <a
              aria-label={`Open ${screen.pageTitle} HTML`}
              className="text-primary grid size-8 place-items-center rounded hover:bg-[#edf5ff]"
              href={htmlUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>
      {commenting && (
        <div className="border-outline border-t bg-[#f8f9fa] p-3">
          <textarea
            autoFocus
            className="border-outline focus:border-primary min-h-24 w-full resize-y rounded border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#d8e2ff]"
            onChange={(event) => setComment(event.target.value)}
            placeholder={`Describe what should change on ${screen.pageTitle}…`}
            value={comment}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded px-3 py-2 text-xs font-semibold hover:bg-[#e7e8e9]"
              onClick={() => setCommenting(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="bg-primary inline-flex items-center gap-2 rounded px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              disabled={!comment.trim() || submitting}
              onClick={() => void submit()}
              type="button"
            >
              {submitting && <LoaderCircle className="animate-spin" size={13} />}
              Apply feedback
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
