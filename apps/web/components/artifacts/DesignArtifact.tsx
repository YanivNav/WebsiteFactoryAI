import type {Artifact} from "@factory/shared";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PencilLine } from "lucide-react";
import type { ScreenInfo } from "@/data/useProjectDetail";

export function DesignArtifact({
  artifact,
  taskId,
}: {
  artifact: Artifact<"design">;
  /** The user task ID — when present, enables per-screen revision in review context. */
  taskId?: Id<"userTasks">;
}) {
  const revise = useMutation(api.projects.reviseCurrentTask);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const screens = artifact.data.screens;
  const assetById = new Map(artifact.assets.map((a) => [a.id, a]));

  const onRequestChange = taskId
    ? (screenPath: string, feedback: string) =>
        void revise({
          userTaskId: taskId,
          sourceArtifactId: artifact.id as Id<"artifacts">,
          feedback,
          screenPath,
        })
    : undefined;

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
              <ScreenCard
                key={screen.path}
                screen={screen}
                completed={{ name: screen.name, path: screen.path, imageUrl: imageAsset?.url || null, htmlUrl: null }}
                subtitle={screen.path}
                onZoom={(s) => setZoomedUrl(s.imageUrl)}
                onRequestChange={onRequestChange}
              />
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

export function ScreenCard({
  screen,
  completed,
  subtitle,
  onZoom,
  onRequestChange,
}: {
  screen: { name: string; path: string };
  completed?: ScreenInfo;
  /** Text under the screen name; defaults to the generation status. */
  subtitle?: string;
  onZoom: (screen: ScreenInfo) => void;
  onRequestChange?: (screenPath: string, feedback: string) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="group overflow-hidden rounded-lg border border-[#e1e3e6] bg-white transition-all duration-300 hover:border-[#adc6ff]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[#e1e3e6] bg-[#edeeef]">
        {completed?.imageUrl ? (
          <>
            <img
              alt={`${screen.name} design`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              src={completed.imageUrl}
              onClick={() => onZoom(completed)}
            />
            {onRequestChange && (
              <button
                className="absolute top-2 right-2 flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#727785] opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:!text-[#0058be]"
                onClick={(e) => { e.stopPropagation(); setFeedbackOpen(!feedbackOpen); }}
                type="button"
              >
                <PencilLine size={11} /> EDIT
              </button>
            )}
          </>
        ) : (
          <SkeletonLoader />
        )}
      </div>

      {feedbackOpen && (
        <div className="border-b border-[#e1e3e6] px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            className="w-full rounded border border-[#e1e3e6] px-2 py-1.5 text-xs outline-none focus:border-[#0058be] focus:ring-1 focus:ring-[#0058be]"
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={`What should change on ${screen.name}?`}
            rows={2}
            value={feedback}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded px-2 py-1 text-[11px] text-[#727785] hover:bg-[#edeeef]"
              onClick={() => { setFeedbackOpen(false); setFeedback(""); }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded bg-[#0058be] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              disabled={!feedback.trim()}
              onClick={() => {
                onRequestChange?.(screen.path, feedback.trim());
                setFeedbackOpen(false);
                setFeedback("");
              }}
              type="button"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-4">
        <div>
          <h4 className="text-sm font-semibold text-[#2c3038]">{screen.name}</h4>
          <p className="text-[11px] text-[#727785]">
            {subtitle ?? (completed ? "Generated just now" : "Generating...")}
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

export function ZoomOverlay({
  imageUrl,
  onClose,
  title = "Design Preview",
}: {
  imageUrl: string;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-6 py-3">
        <h3 className="text-sm font-semibold text-white/80">{title}</h3>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          <span className="text-2xl leading-none">&times;</span>
        </button>
      </div>

      {/* Image — fills remaining space */}
      <div
        className="flex flex-1 items-center justify-center p-4">
        <img
          alt={title}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          src={imageUrl}
        />
      </div>
    </div>
  );
}
