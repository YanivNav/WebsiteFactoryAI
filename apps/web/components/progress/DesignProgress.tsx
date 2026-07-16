"use client";
/* eslint-disable @next/next/no-img-element -- Convex storage URLs are dynamic review assets. */

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { DesignScreenView } from "@/data/useProjectDetail";
import { ScreenPreviewModal } from "../ScreenPreviewModal";
import type { StageProgressViewProps } from ".";

/**
 * Live gallery of the current design run — one card per screen, rendered straight
 * from the `designProgress` rows the worker writes.
 */
export function DesignProgress({ detail }: StageProgressViewProps) {
  const screens = detail.designProgress;
  const [preview, setPreview] = useState<{ pageTitle: string; imageUrl: string } | null>(null);
  const readyCount = screens.filter((screen) => screen.status === "ready").length;
  const progressPercent = Math.min(100, (readyCount / Math.max(1, screens.length)) * 100);
  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
            Visual design
          </p>
          <h2 className="mt-1 text-lg font-semibold">Your screens are taking shape</h2>
        </div>
        <span className="text-xs font-semibold text-[#596170]">
          {readyCount} / {screens.length}
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {screens.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {screens.map((screen) => (
            <ScreenProgressCard
              key={screen.pagePath}
              onPreview={(imageUrl) => setPreview({ pageTitle: screen.pageTitle, imageUrl })}
              screen={screen}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex min-h-48 items-center justify-center rounded bg-[#f1f2f4]">
          <div className="text-center">
            <LoaderCircle className="text-primary mx-auto animate-spin" size={26} />
            <p className="mt-3 text-sm font-semibold">Preparing the first screen…</p>
          </div>
        </div>
      )}
      {preview && (
        <ScreenPreviewModal
          imageUrl={preview.imageUrl}
          onClose={() => setPreview(null)}
          title={preview.pageTitle}
        />
      )}
    </section>
  );
}

const SCREEN_STATUS_LABELS: Record<DesignScreenView["status"], string> = {
  queued: "Queued",
  generating: "Generating…",
  ready: "Ready · click to preview",
};

function ScreenProgressCard({
  onPreview,
  screen,
}: {
  onPreview: (imageUrl: string) => void;
  screen: DesignScreenView;
}) {
  const generating = screen.status === "generating";
  return (
    <article
      className={`border-outline overflow-hidden rounded border bg-white ${generating ? "ring-primary ring-2 ring-offset-2" : ""}`}
    >
      {screen.screenshotUrl ? (
        <button
          className="group block aspect-[16/10] w-full overflow-hidden bg-[#eef0f2]"
          onClick={() => onPreview(screen.screenshotUrl!)}
          type="button"
        >
          <img
            alt={`${screen.pageTitle} design preview`}
            className="h-full w-full object-contain object-top transition-transform group-hover:scale-[1.01]"
            src={screen.screenshotUrl}
          />
        </button>
      ) : (
        <SkeletonScreen />
      )}
      <div className="flex items-center justify-between px-3 py-2.5">
        <strong className="text-xs">{screen.pageTitle}</strong>
        <span
          className={`text-[10px] font-semibold ${generating ? "text-primary" : "text-[#737b88]"}`}
        >
          {SCREEN_STATUS_LABELS[screen.status]}
        </span>
      </div>
    </article>
  );
}

function SkeletonScreen() {
  return (
    <div className="aspect-[16/10] animate-pulse bg-[#eef0f2] p-5">
      <div className="h-4 w-2/5 rounded bg-[#d8dce1]" />
      <div className="mt-5 h-10 w-3/4 rounded bg-[#dfe2e6]" />
      <div className="mt-3 h-3 w-full rounded bg-[#d8dce1]" />
      <div className="mt-2 h-3 w-4/5 rounded bg-[#d8dce1]" />
      <div className="mt-6 h-8 w-28 rounded bg-[#cfd4da]" />
    </div>
  );
}
