"use client";

import { CircleAlert, ExternalLink } from "lucide-react";
import type { Doc, Id } from "@convex/_generated/dataModel";

type ManualTask = Doc<"manualTasks">;

/** The WaitingForManualActions gate: Wix work only a human can do, deep-linked. */
export function ManualActions({
  onComplete,
  projectTitle,
  tasks,
}: {
  onComplete: (taskId: Id<"manualTasks">) => void;
  projectTitle: string;
  tasks: ManualTask[];
}) {
  const required = tasks.filter((task) => task.blocking);
  const optional = tasks.filter((task) => !task.blocking);
  return (
    <div>
      <span className="inline-flex items-center gap-2 rounded bg-[#ffdad6] px-3 py-2 text-[10px] font-bold tracking-[0.08em] text-[#93000a] uppercase">
        <CircleAlert size={14} />
        Action required
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">A few things need you</h1>
      <p className="mt-1 text-sm text-[#596170]">
        {projectTitle} will continue automatically when the required Wix tasks are done.
      </p>
      <div className="border-primary mt-6 rounded border-l-4 bg-[#e7e8e9] px-5 py-4 text-sm">
        The site build is safely paused. Complete these in Wix, then mark them done here.
      </div>
      <TaskGroup label="Required tasks" onComplete={onComplete} tasks={required} />
      {optional.length > 0 && (
        <TaskGroup label="Optional optimizations" onComplete={onComplete} tasks={optional} />
      )}
    </div>
  );
}

function TaskGroup({
  label,
  onComplete,
  tasks,
}: {
  label: string;
  onComplete: (taskId: Id<"manualTasks">) => void;
  tasks: ManualTask[];
}) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-xs font-bold tracking-[0.1em] text-[#424754] uppercase">{label}</h2>
      <div className="space-y-3">
        {tasks.map((task) => (
          <article
            className="border-outline flex items-start gap-4 rounded border bg-white p-5"
            key={task._id}
          >
            <button
              aria-label={`Mark ${task.title} done`}
              className="border-outline hover:border-primary mt-0.5 size-6 shrink-0 rounded border bg-white hover:bg-[#edf5ff]"
              onClick={() => onComplete(task._id)}
              type="button"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{task.title}</h3>
              <p className="mt-1 text-xs leading-5 text-[#596170]">{task.description}</p>
              {task.wixDashboardUrl && (
                <a
                  className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  href={task.wixDashboardUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in Wix <ExternalLink size={13} />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
