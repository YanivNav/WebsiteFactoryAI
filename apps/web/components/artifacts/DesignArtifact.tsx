import type {Artifact} from "@factory/shared";
import { useState } from "react";
import { ZoomOverlay } from "@/components/ZoomOverlay";

export function DesignArtifact({ artifact }: { artifact: Artifact<"design"> }) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const screens = artifact.data.screens;
  const assetById = new Map(artifact.assets.map((a) => [a.id, a]));

  return (
    <>
      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[#2c3038]">
          Design Mockups
          <span className="font-normal text-xs text-[#687182]">
            ({screens.length} screen{screens.length !== 1 ? "s" : ""})
          </span>
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map((screen) => {
            const imageAsset = assetById.get(screen.imageAssetId);
            return (
              <div
                key={screen.path}
                className="group overflow-hidden rounded-lg border border-[#e1e3e6] bg-white transition-all duration-300 hover:border-[#adc6ff]"
              >
                <div className="relative aspect-[4/3] overflow-hidden border-b border-[#e1e3e6] bg-[#edeeef]">
                  {imageAsset?.url ? (
                    <>
                      <img
                        alt={`${screen.name} design`}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        src={imageAsset.url}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0058be]/20 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="flex items-center gap-2 rounded bg-white px-4 py-2 text-xs font-semibold tracking-[0.05em] text-[#0058be] shadow-lg"
                          onClick={() => setZoomedUrl(imageAsset.url)}
                          type="button"
                        >
                          <span className="text-base leading-none">&crarr;</span>
                          ENLARGE
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#727785]">
                      No preview
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-[#2c3038]">{screen.name}</h4>
                  <p className="text-[11px] text-[#727785]">{screen.path}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {zoomedUrl && (
        <ZoomOverlay imageUrl={zoomedUrl} onClose={() => setZoomedUrl(null)} />
      )}
    </>
  );
}
