"use client";

import { Check, CircleAlert, Clock3, History, Sparkles } from "lucide-react";
import { useMutation } from "convex/react";
import type { Doc } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { ActivityView } from "@/components/activities/ActivityView";

export function ProjectWorkspace({
  detail,
  viewedTask,
  onReturnToCurrent,
}: {
  detail: ProjectDetail;
  viewedTask?: Doc<"userTasks">;
  onReturnToCurrent: () => void;
}) {
  const retryCurrentWork = useMutation(api.projects.retryCurrentWork);
  const historical = viewedTask && viewedTask._id !== detail.currentUserTask?._id;
  const completed = detail.activityStatus === "completed";
  const waiting = detail.activityStatus === "waiting" || detail.activityStatus === "draft";
  const failed = detail.activityStatus === "failed";
  const label = historical ? viewedTask.label : detail.activityLabel;

  return (
    <div>
      <section className="border-outline mb-4 rounded border bg-white p-6">
        <div className="flex items-start gap-4">
          <StatusIcon
            completed={completed}
            failed={failed}
            historical={!!historical}
            waiting={waiting}
          />
          <div className="min-w-0 flex-1">
            <p className="text-primary text-[10px] font-bold tracking-widest uppercase">
              {historical
                ? "Previous step"
                : failed
                  ? "Needs attention"
                  : completed
                    ? "Project complete"
                    : waiting
                      ? "Ready for you"
                      : "In progress"}
            </p>
            <div className="flex items-center justify-between gap-4">
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{label}</h1>
              {historical && (
                <button
                  className="text-primary text-sm font-semibold hover:underline"
                  onClick={onReturnToCurrent}
                  type="button"
                >
                  Return to current step
                </button>
              )}
            </div>
            {failed && detail.currentWork?.error && (
              <div className="mt-3 flex w-full items-center gap-3 rounded-lg border border-red-500 bg-red-200/30 p-3">
                <p className="min-w-0 flex-1 break-words">{detail.currentWork.error.message}</p>
                <button
                  className="shrink-0 rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
                  onClick={() => void retryCurrentWork({ projectId: detail.project._id })}
                  type="button"
                >
                  Retry this step
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <ActivityView detail={detail} onReturnToCurrent={onReturnToCurrent} viewedTask={viewedTask} />
    </div>
  );
}

function StatusIcon({
  completed,
  failed,
  historical,
  waiting,
}: {
  completed: boolean;
  failed: boolean;
  historical: boolean;
  waiting: boolean;
}) {
  const className = `grid size-11 shrink-0 place-items-center rounded-full ${
    failed
      ? "bg-[#f8d9d6] text-[#a82922]"
      : completed
        ? "bg-[#def3e6] text-[#17693a]"
        : "bg-[#d8e2ff] text-primary"
  }`;
  return (
    <span className={className}>
      {historical ? (
        <History size={20} />
      ) : failed ? (
        <CircleAlert size={21} />
      ) : completed ? (
        <Check size={21} />
      ) : waiting ? (
        <Clock3 size={20} />
      ) : (
        <Sparkles size={20} />
      )}
    </span>
  );
}
