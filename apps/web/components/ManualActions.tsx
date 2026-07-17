"use client";

import { useState } from "react";
import { Check, CircleAlert, ExternalLink } from "lucide-react";
import type { Doc, Id } from "@convex/_generated/dataModel";

type ManualTask = Doc<"manualTasks">;

/** The WaitingForManualActions gate: Wix work only a human can do, deep-linked. */
export function ManualActions({
  onComplete,
  projectTitle,
  tasks,
}: {
  onComplete: (taskId: Id<"manualTasks">, configurationValue?: string) => void;
  projectTitle: string;
  tasks: ManualTask[];
}) {
  const required = tasks.filter((task) => task.blocking);
  const optional = tasks.filter((task) => !task.blocking);
  const remaining = tasks.filter((task) => !task.completed).length;
  const complete = remaining === 0;
  return (
    <section className="border-outline rounded border bg-[#f3f4f5] p-5">
      <span
        className={`inline-flex items-center gap-2 rounded px-3 py-2 text-[10px] font-bold tracking-[0.08em] uppercase ${
          complete ? "bg-[#d9f4e4] text-[#17693a]" : "bg-[#ffdad6] text-[#93000a]"
        }`}
      >
        {complete ? <Check size={14} /> : <CircleAlert size={14} />}
        {complete
          ? "Setup complete"
          : `${remaining} ${remaining === 1 ? "task" : "tasks"} remaining`}
      </span>
      <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Wix setup checklist</h2>
      <p className="mt-1 text-sm text-[#596170]">
        {complete
          ? `${projectTitle} has all required Wix settings.`
          : `${projectTitle} will continue automatically when the required Wix tasks are done.`}
      </p>
      {!complete && (
        <div className="border-primary mt-5 rounded border-l-4 bg-[#e7e8e9] px-5 py-4 text-sm">
          Follow each task below. The factory saves the supplied settings to Wix for you.
        </div>
      )}
      <TaskGroup label="Required tasks" onComplete={onComplete} tasks={required} />
      {optional.length > 0 && (
        <TaskGroup label="Optional optimizations" onComplete={onComplete} tasks={optional} />
      )}
    </section>
  );
}

function TaskGroup({
  label,
  onComplete,
  tasks,
}: {
  label: string;
  onComplete: (taskId: Id<"manualTasks">, configurationValue?: string) => void;
  tasks: ManualTask[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-xs font-bold tracking-[0.1em] text-[#424754] uppercase">{label}</h2>
      <div className="space-y-3">
        {tasks.map((task) => {
          const guidance = task.configurationKey
            ? {
                label: task.configurationLabel ?? "Required Wix value",
                placeholder: task.configurationPlaceholder ?? "Paste the value from Wix",
                steps: task.instructions ?? [],
                expectedFields: task.expectedFields ?? [],
              }
            : null;
          const dashboardUrl = task.wixDashboardUrl;
          return (
            <article
              className={`rounded border p-5 ${
                task.completed ? "border-[#b8ddc7] bg-[#f5fbf7]" : "border-outline bg-white"
              }`}
              key={task._id}
            >
              <div className="flex items-start gap-4">
                {task.completed ? (
                  <span
                    aria-label={`${task.title} completed`}
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded border border-[#4b9b69] bg-[#d9f4e4] text-[#17693a]"
                  >
                    <Check size={15} strokeWidth={3} />
                  </span>
                ) : (
                  <button
                    aria-label={`Mark ${task.title} done`}
                    className="border-outline hover:border-primary mt-0.5 size-6 shrink-0 rounded border bg-white hover:bg-[#edf5ff] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={Boolean(guidance && !values[task._id]?.trim())}
                    onClick={() => onComplete(task._id, values[task._id])}
                    type="button"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{task.title}</h3>
                    {task.completed && (
                      <span className="text-[10px] font-bold tracking-[0.08em] text-[#17693a] uppercase">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#596170]">{task.description}</p>
                  {guidance && !task.completed && (
                    <>
                      <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-[#424754]">
                        {guidance.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      {guidance.expectedFields.length > 0 && (
                        <div className="mt-4 rounded border border-[#d7dbe2] bg-[#f7f8fa] p-3">
                          <p className="text-xs font-semibold">Template variables</p>
                          <dl className="mt-2 space-y-2">
                            {guidance.expectedFields.map((field) => (
                              <div
                                className="grid gap-0.5 sm:grid-cols-[180px_1fr]"
                                key={field.name}
                              >
                                <dt>
                                  <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-[#253a70]">
                                    {field.name}
                                  </code>
                                </dt>
                                <dd className="text-xs leading-5 text-[#596170]">
                                  {field.description}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                      <label
                        className="mt-4 block text-xs font-semibold"
                        htmlFor={`task-${task._id}`}
                      >
                        {guidance.label}
                      </label>
                      <input
                        className="border-outline focus:border-primary mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
                        id={`task-${task._id}`}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [task._id]: event.target.value }))
                        }
                        placeholder={guidance.placeholder}
                        value={values[task._id] ?? ""}
                      />
                    </>
                  )}
                  {dashboardUrl && (
                    <a
                      className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      href={dashboardUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open this task in Wix <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
