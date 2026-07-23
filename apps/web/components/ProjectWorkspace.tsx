"use client";

import {ArrowLeft, Check, CircleAlert, Clock3, History, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import type {Doc, Id} from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { ActivityView } from "@/components/activities/ActivityView";
import {useUserTask} from "@/data/useUserTask";

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
  const {revisit, busy: revisitBusy} = useUserTask();
  const historical = viewedTask && viewedTask._id !== detail.currentUserTask?._id;
  const completed = detail.activityStatus === "completed";
  const ready = detail.activityStatus === "ready";
  const waiting = detail.activityStatus === "waiting" || detail.activityStatus === "draft";
  const failed = detail.activityStatus === "failed";
  const label = historical ? viewedTask.label : detail.activityLabel;

  const [viewedArtifactId, setViewedArtifactId] = useState<string>();
  const artifact = viewedArtifactId
    ? Object.values(detail.artifacts).flat().find((candidate) => candidate.id === viewedArtifactId)
    : undefined;

  return (
    <div>
      <section className="border-outline mb-4 rounded border bg-white p-6">
        <div className="flex items-start gap-4">
          <StatusIcon
            completed={completed}
            ready={ready}
            failed={failed}
            historical={!!historical}
            waiting={waiting}
          />
          <div className="min-w-0 flex-1">
            {historical && (
              <button
                className="flex items-center gap-1 text-sm hover:underline cursor-pointer"
                onClick={onReturnToCurrent}
                type="button"
              >
                <ArrowLeft size={14} /> Return to current step
              </button>
            )}
            <p className="text-primary text-[10px] font-bold tracking-widest uppercase">
              {historical
                ? null
                : failed
                  ? "Needs attention"
                  : completed
                    ? "Site live"
                    : ready
                      ? "Site ready"
                      : waiting
                        ? "Ready for you"
                        : "In progress"}
            </p>
            <div className="flex items-center justify-between gap-4">
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{label}</h1>
              {historical &&
                <button
                  type="button"
                  onClick={() => {
                    void revisit(
                      viewedTask._id,
                      viewedTask.result.type === "selectVersion"
                        ? (artifact?.id as Id<"artifacts"> | undefined)
                        : undefined,
                    ).then(onReturnToCurrent);
                  }}
                  disabled={!!revisitBusy}
                  className="bg-primary flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {revisitBusy ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                  Go back and revise this
                </button>
              }
            </div>
            {failed && detail.currentWork?.error && !historical && (
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
      <ActivityView
        detail={detail}
        viewedTask={viewedTask}
        viewedArtifactId={viewedArtifactId}
        onViewArtifact={setViewedArtifactId}
      />
    </div>
  );
}

function StatusIcon({
  completed,
  ready,
  failed,
  historical,
  waiting,
}: {
  completed: boolean;
  ready: boolean;
  failed: boolean;
  historical: boolean;
  waiting: boolean;
}) {
  const className = `grid size-11 shrink-0 place-items-center rounded-full ${
    failed && !historical
      ? "bg-[#f8d9d6] text-[#a82922]"
      : completed
        ? "bg-[#def3e6] text-[#17693a]"
        : ready
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
