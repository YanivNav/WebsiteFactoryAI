import { STAGE_LABELS, type Stage } from "@factory/shared";
import type { StageViewProps } from "./StageUI";

const DEFAULT_ACTIVITY: Partial<Record<Stage, string>> = {
  GeneratingQuestions: "Finding the decisions we still need from you",
  GeneratingSpecification: "Defining the pages, content, and Wix features",
};

export function SimpleProgressStage({ detail }: StageViewProps) {
  if (detail.project.status === "failed") return null;

  const progress = Math.min(100, Math.max(0, detail.project.progress ?? 0));
  const stageLabel = STAGE_LABELS[detail.stage];
  const activity =
    detail.statusMessage === stageLabel
      ? (DEFAULT_ACTIVITY[detail.stage] ?? "Working on this step")
      : detail.statusMessage;

  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.1em] text-[#687182] uppercase">
            Current activity
          </p>
          <p className="mt-1 truncate text-base font-medium text-[#2c3038]">{activity}</p>
        </div>
        <div className="text-primary shrink-0 text-sm font-semibold tabular-nums">{progress}%</div>
      </div>
      <div
        aria-label={`${stageLabel} progress`}
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
  );
}
