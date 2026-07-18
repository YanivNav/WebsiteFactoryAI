"use client";

import { Check, CircleAlert, Clock3, Sparkles } from "lucide-react";
import { isWaitingStage, STAGE_LABELS } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { EmptyStageView, STAGE_VIEWS } from "@/components/stages/StageUI";

export function ProjectWorkspace({ detail }: { detail: ProjectDetail }) {
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);
  const { project, stage } = detail;
  const completed = stage === "Completed";
  const waiting = isWaitingStage(stage) && !completed;
  const StageUI = STAGE_VIEWS[stage] || EmptyStageView;

  return (
    <div>
      <section className="border-outline mb-4 rounded border bg-white p-6">
        <div className="flex items-start gap-4">
          <StatusIcon
            completed={completed}
            failed={project.status === "failed"}
            waiting={waiting}
          />
          <div className="min-w-0 flex-1">
            <p className="text-primary text-[10px] font-bold tracking-widest uppercase">
              {project.status === "failed"
                ? "Needs attention"
                : completed
                  ? "Project complete"
                  : waiting
                    ? "Ready for you"
                    : "In progress"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              {STAGE_LABELS[stage]}
            </h1>
            {project.status === "failed" && project.lastError && (
              <div className="mt-3 flex w-full items-center gap-3 rounded-lg border border-red-500 bg-red-200/30 p-3">
                <p className="min-w-0 flex-1 break-words">{project.lastError}</p>
                <button
                  className="shrink-0 rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
                  onClick={() => void retryCurrentStage({ projectId: project._id })}
                  type="button"
                >
                  Retry this step
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <StageUI detail={detail} />
    </div>
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
    <span className={className}>{waiting ? <Clock3 size={20} /> : <Sparkles size={20} />}</span>
  );
}
