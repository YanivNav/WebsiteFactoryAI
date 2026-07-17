"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { isWaitingStage, STAGE_LABELS } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";

export function WorkingWorkspace({
  detail,
  onContinue,
  onRetry,
}: {
  detail: ProjectDetail;
  onContinue: () => Promise<unknown>;
  onRetry: () => Promise<unknown>;
}) {
  const { project, stage, statusMessage } = detail;
  const completed = stage === "Completed";
  const waiting = isWaitingStage(stage) && !completed;

  return (
    <section className="border-outline rounded border bg-white p-6">
      <div className="flex items-start gap-4">
        <StatusIcon completed={completed} failed={project.status === "failed"} waiting={waiting} />
        <div className="min-w-0 flex-1">
          <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
            {project.status === "failed"
              ? "Worker stopped"
              : completed
                ? "Project complete"
                : waiting
                  ? "Waiting for you"
                  : "Worker active"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{STAGE_LABELS[stage]}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[#596170]">
            {project.status === "failed"
              ? (project.lastError ?? "The worker could not complete this placeholder stage.")
              : completed
                ? "The architecture walkthrough is complete. Real stage behavior has not been implemented on this branch."
                : waiting
                  ? "This gate is an architectural placeholder. Continue when you are ready to exercise the next worker stage."
                  : statusMessage}
          </p>
          <div className="mt-5 flex gap-3">
            {waiting && (
              <button
                className="bg-primary rounded px-4 py-2 text-xs font-semibold text-white hover:bg-[#064aa0]"
                onClick={() => void onContinue()}
                type="button"
              >
                Continue
              </button>
            )}
            {project.status === "failed" && (
              <button
                className="rounded bg-[#a82922] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8f211c]"
                onClick={() => void onRetry()}
                type="button"
              >
                Retry worker stage
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusIcon({
  completed,
  failed,
  waiting,
}: {
  completed: boolean;
  failed: boolean;
  waiting: boolean;
}) {
  const className = `grid size-11 shrink-0 place-items-center rounded-full ${
    failed
      ? "bg-[#f8d9d6] text-[#a82922]"
      : completed
        ? "bg-[#def3e6] text-[#17693a]"
        : "bg-[#d8e2ff] text-primary"
  }`;
  if (failed)
    return (
      <span className={className}>
        <CircleAlert size={21} />
      </span>
    );
  if (completed)
    return (
      <span className={className}>
        <Check size={21} />
      </span>
    );
  return (
    <span className={className}>
      <LoaderCircle className={waiting ? "" : "animate-spin"} size={21} />
    </span>
  );
}
