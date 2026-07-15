"use client";

import { useState } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Send,
  Sparkles,
} from "lucide-react";
import type { QuestionSet } from "@factory/shared";
import type { Id } from "@convex/_generated/dataModel";

export function QuickQuestions({
  onSubmit,
  projectTitle,
  questions,
}: {
  onSubmit: (answers: Array<{ questionId: string; value: string }>) => Promise<unknown>;
  projectTitle: string;
  questions: QuestionSet;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const complete = questions.questions.every((question) => Boolean(answers[question.id]?.trim()));
  async function submit() {
    if (!complete) return;
    setSubmitting(true);
    try {
      await onSubmit(
        questions.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id]!,
        })),
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-outline border-b pb-5">
        <span className="rounded bg-[#e7e8e9] px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-[#596170] uppercase">
          Project planning
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">A few quick questions</h1>
        <p className="mt-1 text-sm text-[#596170]">
          Fill the gaps in {projectTitle}’s brief so the site plan reflects the real job.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        {questions.questions.map((question, index) => (
          <section className="border-outline rounded border bg-white p-4" key={question.id}>
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="text-sm font-semibold">{question.prompt}</h2>
              <span className="text-[10px] font-semibold text-[#858c98]">
                {index + 1} / {questions.questions.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => (
                <button
                  aria-pressed={answers[question.id] === option.label}
                  className={`min-h-11 rounded border px-3 text-xs font-semibold tracking-[0.03em] transition-colors ${answers[question.id] === option.label ? "border-primary bg-[#d8e2ff] text-[#004395]" : "border-outline bg-[#f8f9fa] hover:bg-[#f1f2f4]"}`}
                  key={option.id}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, [question.id]: option.label }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {question.allowCustom && (
              <div className="mt-3 flex gap-2">
                <input
                  className="border-outline focus:border-primary min-w-0 flex-1 rounded border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#d8e2ff]"
                  onChange={(event) =>
                    setCustom((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  placeholder="Another answer…"
                  value={custom[question.id] ?? ""}
                />
                <button
                  className="border-outline rounded border px-3 text-xs font-semibold disabled:opacity-40"
                  disabled={!custom[question.id]?.trim()}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: custom[question.id]!.trim(),
                    }))
                  }
                  type="button"
                >
                  Use answer
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="border-outline mt-6 flex justify-end border-t pt-5">
        <button
          className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-6 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-40"
          disabled={!complete || submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? (
            <LoaderCircle className="animate-spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          Generate site plan
        </button>
      </div>
    </div>
  );
}

export function ManualActions({
  onComplete,
  projectTitle,
  tasks,
}: {
  onComplete: (taskId: Id<"manualTasks">) => void;
  projectTitle: string;
  tasks: Array<{
    _id: Id<"manualTasks">;
    title: string;
    description: string;
    blocking: boolean;
    wixDashboardUrl?: string;
  }>;
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
  tasks: Array<{
    _id: Id<"manualTasks">;
    title: string;
    description: string;
    wixDashboardUrl?: string;
  }>;
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

export function LiveWorkspace({
  change,
  changeRequests,
  onChange,
  onSubmit,
  project,
}: {
  change: string;
  changeRequests: Array<{
    _id: string;
    description: string;
    status: string;
    _creationTime: number;
  }>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  project: { title: string; wix?: { liveUrl?: string; previewUrl?: string } };
}) {
  return (
    <div className="space-y-5">
      <section className="border-outline flex flex-col justify-between gap-4 rounded border bg-white p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#22a75a]" />
            <span className="text-[10px] font-bold tracking-[0.1em] text-[#17693a] uppercase">
              Live & active
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            {project.wix?.liveUrl ? safeHostname(project.wix.liveUrl) : project.title}
          </h1>
        </div>
        {project.wix?.liveUrl && (
          <a
            className="bg-primary inline-flex min-h-10 items-center justify-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0]"
            href={project.wix.liveUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open live site <ExternalLink size={15} />
          </a>
        )}
      </section>
      <section className="border-outline overflow-hidden rounded border bg-white">
        <div className="border-outline flex h-11 items-center gap-2 border-b bg-[#e1e3e4] px-4">
          <i className="size-2.5 rounded-full bg-[#d28f8d]" />
          <i className="size-2.5 rounded-full bg-[#c9a979]" />
          <i className="size-2.5 rounded-full bg-[#82a8d4]" />
          <span className="border-outline mx-auto max-w-md truncate rounded border bg-white px-5 py-1 text-[10px] text-[#596170]">
            {project.wix?.liveUrl ?? "Live Wix site"}
          </span>
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 bg-[#f0f2f4] p-8 text-center">
          <Globe2 size={36} className="text-primary" />
          <p className="font-semibold">Your Wix site is live</p>
          <p className="text-sm text-[#697181]">
            Use the verified live-site link above to view or manage it.
          </p>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="border-outline flex min-h-80 flex-col rounded border bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary" size={19} />
            <h2 className="text-lg font-semibold">Continuous improvement</h2>
          </div>
          <p className="mt-2 text-sm leading-5 text-[#596170]">
            Describe the next client change in plain language. It will join the project queue and
            rebuild against the approved site.
          </p>
          <textarea
            className="border-outline focus:border-primary mt-5 min-h-32 w-full resize-y rounded border bg-[#f8f9fa] p-3 text-sm outline-none placeholder:text-[#737b88] focus:ring-2 focus:ring-[#d8e2ff]"
            onChange={(event) => onChange(event.target.value)}
            placeholder="e.g. Update the summer menu and make the hero image warmer…"
            value={change}
          />
          <div className="mt-auto flex justify-end pt-5">
            <button
              className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-40"
              disabled={!change.trim()}
              onClick={onSubmit}
              type="button"
            >
              <Send size={15} />
              Request change
            </button>
          </div>
        </section>
        <section className="border-outline rounded border bg-[#f3f4f5] p-4">
          <h2 className="text-sm font-semibold">Change history</h2>
          <div className="mt-3 space-y-2">
            {changeRequests.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#737b88]">No changes requested yet.</p>
            ) : (
              changeRequests
                .slice()
                .reverse()
                .slice(0, 4)
                .map((item) => (
                  <article className="border-outline rounded border bg-white p-3" key={item._id}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs leading-4 font-semibold">{item.description}</p>
                      <Check
                        size={13}
                        className={item.status === "done" ? "text-[#22a75a]" : "text-[#d18a00]"}
                      />
                    </div>
                    <p className="mt-2 text-[10px] tracking-[0.08em] text-[#697181] uppercase">
                      {item.status} · {formatDate(item._creationTime)}
                    </p>
                  </article>
                ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Live Wix site";
  }
}
function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
