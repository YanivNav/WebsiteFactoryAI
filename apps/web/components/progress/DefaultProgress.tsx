"use client";

import { LoaderCircle } from "lucide-react";
import type { StageProgressViewProps } from ".";

/** Shared determinate progress view for every non-design work stage. */
export function DefaultProgress({ detail }: StageProgressViewProps) {
  const progress = detail.stageProgress;
  const failed = Boolean(detail.project.lastError);
  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-center gap-4">
        <LoaderCircle
          className={`text-primary shrink-0 ${failed ? "" : "animate-spin"}`}
          size={24}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">{progress?.label ?? detail.statusMessage}</h2>
            <span className="text-xs font-semibold text-[#596170]">
              {progress?.percent ?? 0}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
