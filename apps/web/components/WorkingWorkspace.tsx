"use client";
/* eslint-disable @next/next/no-img-element -- Convex storage URLs are dynamic review assets. */

import { useState } from "react";
import { CircleAlert, LoaderCircle, Rocket } from "lucide-react";
import { STAGE_LABELS, type Stage } from "@factory/shared";

export function WorkingWorkspace({
  assetUrls,
  attempts,
  lastError,
  logs,
  plannedDesignScreens,
  previousDesignScreens,
  onRetry,
  projectTitle,
  stage,
}: {
  assetUrls: Record<string, string | null>;
  attempts: number;
  lastError?: string;
  logs: Array<{
    _id: string;
    message: string;
    level: string;
    _creationTime: number;
    data?: unknown;
  }>;
  plannedDesignScreens?: Array<{ pageTitle: string; pagePath: string }>;
  previousDesignScreens?: Array<{
    pageTitle: string;
    pagePath: string;
    screenshotStorageId: string;
  }>;
  onRetry: () => Promise<unknown>;
  projectTitle: string;
  stage: Stage;
}) {
  const [activeProgressPreview, setActiveProgressPreview] = useState<{
    pageTitle: string;
    imageUrl: string;
  } | null>(null);
  const stageLogs = logs.filter((log) => log.message === "Designing your site");
  const currentDesignStartedAt = stageLogs[0]?._creationTime ?? 0;
  const designStarted = logs.find(
    (log) =>
      log._creationTime >= currentDesignStartedAt &&
      (log.data as { kind?: string } | undefined)?.kind === "design-started",
  )?.data as
    | {
        total?: number;
        screens?: Array<{ pageTitle: string; pagePath: string }>;
      }
    | undefined;
  const generatedScreens = logs
    .filter(
      (log) =>
        log._creationTime >= currentDesignStartedAt &&
        (log.data as { kind?: string } | undefined)?.kind === "design-screen-ready",
    )
    .slice()
    .reverse();
  const latestMessage = logs[0]?.message ?? STAGE_LABELS[stage];
  const activeGeneration = logs.find(
    (log) =>
      log._creationTime >= currentDesignStartedAt &&
      (log.data as { kind?: string } | undefined)?.kind === "design-screen-generating",
  )?.data as { pageTitle?: string } | undefined;
  const activeScreenTitle =
    activeGeneration?.pageTitle ??
    latestMessage.match(/Generating desktop screen \d+\/\d+: (.+)$/)?.[1];
  const designTotal =
    (generatedScreens[0]?.data as { total?: number } | undefined)?.total ??
    designStarted?.total ??
    plannedDesignScreens?.length ??
    0;
  const basePlannedScreens =
    previousDesignScreens ??
    designStarted?.screens ??
    plannedDesignScreens ??
    generatedScreens.map((log) => {
      const screen = log.data as { pageTitle: string; pagePath: string };
      return { pageTitle: screen.pageTitle, pagePath: screen.pagePath };
    });
  const generatedAdditions = generatedScreens
    .map((log) => log.data as { pageTitle: string; pagePath: string })
    .filter(
      (screen) => !basePlannedScreens.some((planned) => planned.pageTitle === screen.pageTitle),
    );
  const screensWithAdditions = [...basePlannedScreens, ...generatedAdditions];
  const plannedScreens =
    activeScreenTitle &&
    !screensWithAdditions.some((screen) => screen.pageTitle === activeScreenTitle)
      ? [
          ...screensWithAdditions,
          { pageTitle: activeScreenTitle, pagePath: `#generating-${activeScreenTitle}` },
        ]
      : screensWithAdditions;
  const displayTotal = plannedScreens.length || designTotal;
  const activeStillGenerating =
    activeScreenTitle &&
    !generatedScreens.some(
      (log) => (log.data as { pageTitle?: string } | undefined)?.pageTitle === activeScreenTitle,
    );
  const completedCount = previousDesignScreens
    ? plannedScreens.filter(
        (screen) => !activeStillGenerating || screen.pageTitle !== activeScreenTitle,
      ).length
    : generatedScreens.length;
  const designProgress = Math.min(100, (completedCount / Math.max(1, displayTotal)) * 100);
  return (
    <div className="space-y-5">
      {(lastError || attempts >= 3) && (
        <section className="rounded border border-[#e4aaa6] bg-[#fff3f2] p-5">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 shrink-0 text-[#a82922]" size={20} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.1em] text-[#a82922] uppercase">
                This step failed
              </p>
              <h2 className="mt-1 text-base font-semibold">
                {attempts >= 3 ? "Automatic retries stopped" : "We’re retrying automatically"}
              </h2>
              <p className="mt-2 text-sm leading-5 break-words text-[#713631]">
                {lastError ?? "This step reached the automatic retry limit."}
              </p>
              {attempts >= 3 && (
                <button
                  className="mt-4 rounded bg-[#a82922] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8f211c]"
                  onClick={() => void onRetry()}
                  type="button"
                >
                  Retry this step
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="border-outline rounded border bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="text-primary grid size-11 shrink-0 place-items-center rounded-full bg-[#d8e2ff]">
            <Rocket className="animate-pulse" size={21} />
          </div>
          <div>
            <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
              Working automatically
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              {STAGE_LABELS[stage]}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[#596170]">
              {projectTitle} is moving forward. You don’t need to do anything right now; this page
              will update as soon as the next review or Wix task is ready.
            </p>
          </div>
        </div>
      </section>
      {stage === "GeneratingDesign" ? (
        <section className="border-outline rounded border bg-white p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
                Visual design
              </p>
              <h2 className="mt-1 text-lg font-semibold">Your screens are taking shape</h2>
            </div>
            <span className="text-xs font-semibold text-[#596170]">
              {completedCount} / {displayTotal}
            </span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${designProgress}%` }}
            />
          </div>
          {plannedScreens.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {plannedScreens.map((planned) => {
                const readyLog = generatedScreens.find(
                  (log) =>
                    (log.data as { pageTitle?: string } | undefined)?.pageTitle ===
                    planned.pageTitle,
                );
                const newlyReady = readyLog?.data as
                  { pageTitle: string; screenshotStorageId: string } | undefined;
                const generating = activeScreenTitle === planned.pageTitle && !newlyReady;
                const previous = previousDesignScreens?.find(
                  (screen) => screen.pageTitle === planned.pageTitle,
                );
                const ready = newlyReady ?? (!generating ? previous : undefined);
                const imageUrl = ready ? assetUrls[ready.screenshotStorageId] : null;
                return (
                  <article
                    className={`border-outline overflow-hidden rounded border bg-white ${generating ? "ring-primary ring-2 ring-offset-2" : ""}`}
                    key={`${planned.pagePath}-${planned.pageTitle}`}
                  >
                    {imageUrl ? (
                      <button
                        className="group block aspect-[16/10] w-full overflow-hidden bg-[#eef0f2]"
                        onClick={() =>
                          setActiveProgressPreview({ pageTitle: planned.pageTitle, imageUrl })
                        }
                        type="button"
                      >
                        <img
                          alt={`${planned.pageTitle} design preview`}
                          className="h-full w-full object-contain object-top transition-transform group-hover:scale-[1.01]"
                          src={imageUrl}
                        />
                      </button>
                    ) : (
                      <div className="aspect-[16/10] animate-pulse bg-[#eef0f2] p-5">
                        <div className="h-4 w-2/5 rounded bg-[#d8dce1]" />
                        <div className="mt-5 h-10 w-3/4 rounded bg-[#dfe2e6]" />
                        <div className="mt-3 h-3 w-full rounded bg-[#d8dce1]" />
                        <div className="mt-2 h-3 w-4/5 rounded bg-[#d8dce1]" />
                        <div className="mt-6 h-8 w-28 rounded bg-[#cfd4da]" />
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <strong className="text-xs">{planned.pageTitle}</strong>
                      <span
                        className={`text-[10px] font-semibold ${generating ? "text-primary" : "text-[#737b88]"}`}
                      >
                        {ready ? "Ready · click to preview" : generating ? "Generating…" : "Queued"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 flex min-h-48 items-center justify-center rounded bg-[#f1f2f4]">
              <div className="text-center">
                <LoaderCircle className="text-primary mx-auto animate-spin" size={26} />
                <p className="mt-3 text-sm font-semibold">Preparing the first screen…</p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="border-outline rounded border bg-white p-5">
          <div className="flex items-center gap-4">
            <LoaderCircle className="text-primary shrink-0 animate-spin" size={24} />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{latestMessage}</h2>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
                <div className="bg-primary h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          </div>
        </section>
      )}
      {activeProgressPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setActiveProgressPreview(null)
          }
        >
          <div className="max-h-[94vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2">
              <strong className="text-sm">{activeProgressPreview.pageTitle} · Desktop</strong>
              <button
                className="text-primary rounded px-3 py-1.5 text-xs font-semibold hover:bg-[#edf5ff]"
                onClick={() => setActiveProgressPreview(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <img
              alt={`${activeProgressPreview.pageTitle} enlarged design preview`}
              className="h-auto w-full"
              src={activeProgressPreview.imageUrl}
            />
          </div>
        </div>
      )}
    </div>
  );
}
