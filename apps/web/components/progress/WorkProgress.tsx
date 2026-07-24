import type { ComponentType } from "react";
import type { WorkOperation } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { DesignProgress } from "./DesignProgress";
import { AgentThoughts } from "./AgentThoughts";

/** Operations with a richer live view rendered under the progress bar. */
const OPERATION_PROGRESS_VIEWS: Partial<Record<WorkOperation, ComponentType<{ detail: ProjectDetail }>>> = {
  generateDesign: DesignProgress,
};

export function WorkProgress({ detail }: { detail: ProjectDetail }) {
  const work = detail.currentWork;
  if (!work || work.status === "failed") return null;
  const progress = Math.min(100, Math.max(0, detail.progress?.percent ?? 0));
  const message = detail.progress?.message ?? work.label;

  const ProgressView = OPERATION_PROGRESS_VIEWS[work.instruction.type as WorkOperation];

  return (
    <div className="space-y-4">
      <section className="border-outline rounded border bg-white p-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.1em] text-[#687182] uppercase">
              Current activity
            </p>
            <p className="mt-1 truncate text-base font-medium text-[#2c3038]">{message}</p>
          </div>
          <div className="text-primary shrink-0 text-sm font-semibold tabular-nums">{progress}%</div>
        </div>
        <div
          aria-label={`${work.label} progress`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#e1e3e6]"
          role="progressbar"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>
      {ProgressView && <ProgressView detail={detail} />}
      <AgentThoughts detail={detail} />
    </div>
  );
}
