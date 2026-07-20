"use client";

import { useState } from "react";
import type { ProjectDetail } from "@/data/useProjectDetail";

interface ScreenInfo {
  name: string;
  path: string;
  imageUrl: string | null;
  htmlUrl: string | null;
}

export function DesignProgress({ detail }: { detail: ProjectDetail }) {
  const [zoomedScreen, setZoomedScreen] = useState<ScreenInfo | null>(null);

  // Expected screens come from the latest specification artifact.
  const spec = detail.artifacts.specification[0];
  const expectedScreens = spec
    ? [
        { name: spec.data.homePage.name, path: spec.data.homePage.path },
        ...spec.data.pages.map((page) => ({ name: page.name, path: page.path })),
      ]
    : [];

  // Completed screens reported via progress data as the worker generates.
  const completedScreens: ScreenInfo[] =
    (detail.progress?.data as { completedScreens?: ScreenInfo[] } | undefined)
      ?.completedScreens ?? [];

  const completedByPath = new Map(completedScreens.map((screen) => [screen.path, screen]));

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[#2c3038]">
            Design Mockups
            {expectedScreens.length > 0 && (
              <span className="font-normal text-xs text-[#687182]">
                ({completedScreens.length}/{expectedScreens.length} screens)
              </span>
            )}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {expectedScreens.map((screen) => {
            const completed = completedByPath.get(screen.path);
            return (
              <ScreenCard
                key={screen.path}
                screen={screen}
                completed={completed}
                onZoom={setZoomedScreen}
              />
            );
          })}
        </div>
      </section>

      {/* Zoom overlay */}
      {zoomedScreen && (
        <ZoomOverlay screen={zoomedScreen} onClose={() => setZoomedScreen(null)} />
      )}
    </>
  );
}

function ScreenCard({
  screen,
  completed,
  onZoom,
}: {
  screen: { name: string; path: string };
  completed?: ScreenInfo;
  onZoom: (screen: ScreenInfo) => void;
}) {
  return (
    <div className="group overflow-hidden rounded-lg border border-[#e1e3e6] bg-white transition-all duration-300 hover:border-[#adc6ff]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[#e1e3e6] bg-[#edeeef]">
        {completed?.imageUrl ? (
          <>
            <img
              alt={`${screen.name} design`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              src={completed.imageUrl}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-[#0058be]/20 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="flex items-center gap-2 rounded bg-white px-4 py-2 text-xs font-semibold tracking-[0.05em] text-[#0058be] shadow-lg"
                onClick={() => onZoom(completed)}
                type="button"
              >
                <span className="text-base leading-none">&crarr;</span>
                ENLARGE
              </button>
            </div>
          </>
        ) : (
          <SkeletonLoader />
        )}
      </div>
      <div className="flex items-center justify-between p-4">
        <div>
          <h4 className="text-sm font-semibold text-[#2c3038]">{screen.name}</h4>
          <p className="text-[11px] text-[#727785]">
            {completed ? "Generated just now" : "Generating..."}
          </p>
        </div>
        {completed && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#def3e6] text-[10px] text-[#17693a]">
            ✓
          </span>
        )}
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="flex h-full w-full animate-pulse flex-col gap-3 p-4">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="h-4 w-8 rounded bg-[#d9dadb]" />
        <div className="h-4 flex-1 rounded bg-[#d9dadb]" />
      </div>
      {/* Hero block */}
      <div className="h-1/3 w-full rounded bg-[#e1e3e4]" />
      {/* Content lines */}
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded bg-[#d9dadb]" />
        <div className="h-3 w-1/2 rounded bg-[#d9dadb]" />
        <div className="h-3 w-2/3 rounded bg-[#d9dadb]" />
      </div>
      {/* Card grid */}
      <div className="mt-auto grid grid-cols-3 gap-2">
        <div className="h-12 rounded bg-[#e1e3e4]" />
        <div className="h-12 rounded bg-[#e1e3e4]" />
        <div className="h-12 rounded bg-[#e1e3e4]" />
      </div>
    </div>
  );
}

function ZoomOverlay({
  screen,
  onClose,
}: {
  screen: ScreenInfo;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e1e3e6] p-4">
          <h3 className="text-sm font-semibold text-[#2c3038]">{screen.name}</h3>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#edeeef]"
            onClick={onClose}
            type="button"
          >
            <span className="text-xl leading-none text-[#727785]">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#f8f9fa] p-8">
          {screen.imageUrl ? (
            <img
              alt={`${screen.name} full preview`}
              className="mx-auto max-w-full border border-[#e1e3e6] shadow-lg"
              src={screen.imageUrl}
            />
          ) : (
            <p className="text-center text-sm text-[#727785]">Preview not yet available</p>
          )}
        </div>
      </div>
    </div>
  );
}
