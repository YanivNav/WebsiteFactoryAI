"use client";

import {Check, LoaderCircle, RotateCcw, X} from "lucide-react";
import {PHASE_LABELS, PHASES} from "@factory/shared";
import type {Id} from "@convex/_generated/dataModel";
import type {ProjectDetail} from "@/data/useProjectDetail";
import {api} from "@convex/_generated/api";
import {useMutation} from "convex/react";
import {useState} from "react";

export function LifecycleTimeline({
  detail,
  viewedTaskId,
  onViewTask,
  onReset,
}: {
  detail: ProjectDetail;
  viewedTaskId?: Id<"userTasks">;
  onViewTask: (taskId: Id<"userTasks">) => void;
  onReset: () => void;
}) {
  const currentIndex = PHASES.indexOf(detail.phase);

  return (
    <aside className="border-outline relative z-0 hidden w-72 shrink-0 border-r bg-[#f3f4f5] px-5 py-6 lg:block">
      <h2 className="mb-6 text-[11px] font-bold tracking-[0.1em] text-[#596170] uppercase">
        Project progression
      </h2>
      {detail.project.currentActivity.type !== "draft" && (
        <RestartFromBrief detail={detail} onReset={onReset} />
      )}
      <div className="relative">
        <div className="absolute top-3 bottom-3 left-3 w-px bg-[#c2c6d6]" />
        <ol className="relative space-y-6">
          {PHASES.map((phase, index) => {
            const active = index === currentIndex;
            const complete = index < currentIndex || detail.activityStatus === "completed" || detail.activityStatus === "ready";
            const tasks = detail.userTasks.filter(
              (task) => task.phase === phase && task.status !== "cancelled",
            );
            return (
              <li className="flex items-start gap-3" key={phase}>
                <StepIcon
                  active={active}
                  complete={complete}
                  working={active && detail.activityStatus === "working"}
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold ${
                      active ? "text-primary" : complete ? "text-ink" : "text-[#858c98]"
                    }`}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                  {(complete || active) && (
                    <span className="mt-0.5 block text-[11px] text-[#737b88]">
                      {complete ? "Completed" : activityStatusLabel(detail.activityStatus)}
                    </span>
                  )}
                  {tasks.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {tasks.map((task) => (
                        <button
                          className={`truncate flex items-center gap-1 rounded px-2 py-1 text-left text-xs transition-colors ${
                            (viewedTaskId ?? detail.currentUserTask?._id) === task._id
                              ? "bg-[#d8e2ff] font-semibold text-[#004395]"
                              : "text-[#596170] hover:bg-white hover:text-[#004395]"
                          }`}
                          key={task._id}
                          onClick={() => onViewTask(task._id)}
                          type="button"
                        >
                          {task.status === "completed" ? <Check size={14} /> : null}
                          {task.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

function RestartFromBrief({ detail, onReset }: { detail: ProjectDetail; onReset: () => void }) {
  const restart = useMutation(api.projects.restartFromBrief);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await restart({ projectId: detail.project._id });
      onReset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="text-ink-muted hover:text-primary my-3 flex items-center gap-2 text-xs font-semibold"
        onClick={() => setOpen(true)}
        type="button"
      >
        <RotateCcw size={14} /> Start again from the brief
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(25,28,29,.34)] p-6 backdrop-blur-[3px]">
          <section className="border-outline w-full max-w-lg rounded-xl border bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-ink text-lg font-semibold">Start again from the brief?</h2>
                <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                  Questions, site plans, designs, progress, and their version history will be
                  permanently removed. Your project, brief, and Wix connections will remain.
                </p>
              </div>
              <button
                aria-label="Close"
                className="text-ink-muted hover:text-ink"
                disabled={busy}
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="border-outline rounded border bg-white px-4 py-2 text-sm font-semibold"
                disabled={busy}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void confirm()}
                type="button"
              >
                {busy ? "Resetting…" : "Delete and start over"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function StepIcon({
  active,
  complete,
  working,
}: {
  active: boolean;
  complete: boolean;
  working: boolean;
}) {
  const tone = complete
    ? "border-primary bg-primary"
    : active
      ? "border-primary bg-primary ring-4 ring-[#d8e2ff]"
      : "border-[#c2c6d6] bg-[#f3f4f5]";
  return (
    <span
      className={`relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border text-white ${tone}`}
    >
      {complete ? (
        <Check size={13} />
      ) : active ? (
        <LoaderCircle className={working ? "animate-spin" : ""} size={13} />
      ) : (
        <i className="size-2 rounded-full bg-[#c2c6d6]" />
      )}
    </span>
  );
}

function activityStatusLabel(status: ProjectDetail["activityStatus"]) {
  if (status === "waiting" || status === "draft") return "Waiting";
  if (status === "failed") return "Needs attention";
  return "In progress";
}
