"use client";
/* eslint-disable @next/next/no-img-element -- Convex storage URLs are dynamic review assets. */

/** Fullscreen enlargement of one design screenshot. Click outside or Close to dismiss. */
export function ScreenPreviewModal({
  imageUrl,
  onClose,
  title,
}: {
  imageUrl: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[94vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-2 shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2">
          <strong className="text-sm">{title} · Desktop</strong>
          <button
            className="text-primary rounded px-3 py-1.5 text-xs font-semibold hover:bg-[#edf5ff]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <img alt={`${title} enlarged design preview`} className="h-auto w-full" src={imageUrl} />
      </div>
    </div>
  );
}
