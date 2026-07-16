"use client";

import { LoaderCircle } from "lucide-react";
import type { StageProgressViewProps } from ".";

/** Fallback progress view: the latest activity line and an indeterminate bar. */
export function DefaultProgress({ detail }: StageProgressViewProps) {
  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-center gap-4">
        <LoaderCircle className="text-primary shrink-0 animate-spin" size={24} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{detail.statusMessage}</h2>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
            <div className="bg-primary h-full w-2/3 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
