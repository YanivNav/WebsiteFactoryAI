"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ProjectDetail, ScreenInfo } from "@/data/useProjectDetail";
import { ExternalLink } from "lucide-react";
import { ScreenCard, ZoomOverlay } from "@/components/artifacts/DesignArtifact";


export function DesignProgress({ detail }: { detail: ProjectDetail }) {
  const [zoomedScreen, setZoomedScreen] = useState<ScreenInfo | null>(null);
  const requestScreenRevision = useMutation(api.projects.requestScreenRevision);

  // Expected screens come from the latest specification artifact.
  const spec = detail.artifacts.specification[0];
  const expectedScreens = spec
    ? [
        { name: spec.data.homePage.name, path: spec.data.homePage.path },
        ...spec.data.pages.map((page) => ({ name: page.name, path: page.path })),
      ]
    : [];

  // Screens kept from the revision base appear here immediately; regenerated
  // ones as the worker finishes them.
  const completedScreens = detail.designProgress?.completedScreens ?? [];
  const stitchProjectId = detail.designProgress?.stitchProjectId;
  const completedByPath = new Map(completedScreens.map((screen) => [screen.path, screen]));

  const workId = detail.currentWork?._id;

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[#2c3038]">
            Design Mockups
            {expectedScreens.length > 0 && (
              <span className="font-normal text-xs text-[#687182]">
                ({completedByPath.size}/{expectedScreens.length} screens)
              </span>
            )}
          </h3>
        </div>
        {stitchProjectId && (
          <div className="my-3 flex gap-1">Want to see the progress in real time?
            <a className="underline text-primary hover:no-underline flex gap-1 items-center"
               href={`https://stitch.withgoogle.com/projects/${stitchProjectId}`}
               target="_blank">Open in Stitch <ExternalLink size={14} /></a>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {expectedScreens.map((screen) => {
            const completed = completedByPath.get(screen.path);
            return (
              <ScreenCard
                key={screen.path}
                screen={screen}
                completed={completed}
                onZoom={setZoomedScreen}
                onRequestChange={
                  workId
                    ? (screenPath, feedback) =>
                        void requestScreenRevision({
                          workId: workId as Id<"works">,
                          screenPath,
                          feedback,
                        })
                    : undefined
                }
              />
            );
          })}
        </div>
      </section>

      {zoomedScreen?.imageUrl && (
        <ZoomOverlay
          imageUrl={zoomedScreen.imageUrl}
          onClose={() => setZoomedScreen(null)}
          title={zoomedScreen.name}
        />
      )}
    </>
  );
}
