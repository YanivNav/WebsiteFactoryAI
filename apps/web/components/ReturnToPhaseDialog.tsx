"use client";

import { LoaderCircle, X } from "lucide-react";

/** Confirmation before reopening an earlier phase. Nothing is deleted by returning. */
export function ReturnToPhaseDialog({
  label,
  onCancel,
  onConfirm,
  submitting,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
}) {
  return (
    <div
      aria-labelledby="return-phase-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#17191c]/45 p-4 backdrop-blur-[2px]"
      role="dialog"
    >
      <section className="border-outline w-full max-w-md rounded-lg border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e1e3e6] p-5">
          <div>
            <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
              Project progression
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]" id="return-phase-title">
              Return to {label}?
            </h2>
          </div>
          <button
            aria-label="Close dialog"
            className="grid size-8 shrink-0 place-items-center rounded text-[#596170] hover:bg-[#f0f1f3]"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm leading-5 text-[#596170]">
            The latest saved {label.toLowerCase()} will reopen. Work from later phases stays in the
            project, so nothing is deleted.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              className="border-outline min-h-10 rounded border bg-white px-5 text-xs font-semibold hover:bg-[#f1f2f4] disabled:opacity-50"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              Keep current phase
            </button>
            <button
              className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-50"
              disabled={submitting}
              onClick={() => void onConfirm()}
              type="button"
            >
              {submitting && <LoaderCircle className="animate-spin" size={14} />}
              Return to {label}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
