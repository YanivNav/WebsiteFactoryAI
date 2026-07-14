"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { isWaitingStage, STAGE_LABELS, type Stage } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  // ONE live-updating query. This is the payoff for Convex: the user watches their
  // site get built and the page simply updates. No polling, no SSE, no subscriptions.
  const data = useQuery(api.projects.detail, { projectId });

  const approve = useMutation(api.reviews.approve);
  const requestChanges = useMutation(api.reviews.requestChanges);
  const completeTask = useMutation(api.manualTasks.complete);
  const requestChange = useMutation(api.changeRequests.create);

  const [comment, setComment] = useState("");
  const [change, setChange] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);

  if (data === undefined) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (data === null) return <p className="text-sm text-neutral-400">Not found.</p>;

  const { project, logs, manualTasks, artifacts, pendingReview } = data;
  const stage = project.currentStage as Stage;
  const working = !isWaitingStage(stage);

  const blockingTasks = manualTasks.filter((t) => !t.completed);

  return (
    <main className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-600">
          ← All websites
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.title}</h1>
      </div>

      {/* Where we are. Plain language, always. */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-3">
          {working && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          )}
          <span className="font-medium">{STAGE_LABELS[stage]}</span>
        </div>
        {working && (
          <p className="mt-1 text-sm text-neutral-500">
            Working on it — you don&apos;t need to do anything right now.
          </p>
        )}
      </section>

      {/* A gate. The user judges an artifact they can actually evaluate. */}
      {pendingReview && (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-medium">
            {pendingReview.artifactType === "specification" && "Review your site plan"}
            {pendingReview.artifactType === "design" && "Review your design"}
            {pendingReview.artifactType === "preview" && "Review your site"}
          </h2>
          <p className="text-sm text-neutral-600">
            Version {pendingReview.version}. Happy with this, or want changes?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => approve({ reviewId: pendingReview._id })}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Looks good
            </button>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What should change?"
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <button
              onClick={async () => {
                if (!comment.trim()) return;
                await requestChanges({
                  reviewId: pendingReview._id,
                  comments: [comment],
                });
                setComment("");
              }}
              disabled={!comment.trim()}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </section>
      )}

      {/* Manual tasks. Deep links into the Wix dashboard they already know —
          never "run this command". */}
      {stage === "WaitingForManualActions" && blockingTasks.length > 0 && (
        <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="font-medium">A couple of things only you can do</h2>
          {blockingTasks.map((t) => (
            <div
              key={t._id}
              className="flex items-start justify-between gap-4 rounded-lg bg-white p-4"
            >
              <div>
                <p className="text-sm font-medium">
                  {t.title}
                  {!t.blocking && (
                    <span className="ml-2 text-xs text-neutral-400">optional</span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-neutral-500">{t.description}</p>
                {t.wixDashboardUrl && (
                  <a
                    href={t.wixDashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                  >
                    Open in Wix →
                  </a>
                )}
              </div>
              <button
                onClick={() => completeTask({ taskId: t._id })}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Done
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Completed is a RESTING state, not a terminal one. */}
      {stage === "Completed" && (
        <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-medium">Your site is live</h2>
          <div className="flex gap-2">
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="Want to change something? Just say it — e.g. make the hero blue"
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <button
              onClick={async () => {
                if (!change.trim()) return;
                await requestChange({ projectId, description: change });
                setChange("");
              }}
              disabled={!change.trim()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Make the change
            </button>
          </div>
        </section>
      )}

      {/* The activity feed, DERIVED from structured logs — never raw AI chatter. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500">Activity</h2>
        <ul className="space-y-1.5">
          {logs.map((l) => (
            <li key={l._id} className="flex gap-3 text-sm">
              <span className="shrink-0 text-neutral-300">
                {new Date(l._creationTime).toLocaleTimeString()}
              </span>
              <span
                className={l.level === "error" ? "text-red-600" : "text-neutral-700"}
              >
                {l.message}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Raw internals live behind a disclosure — for the operator, not the user. */}
      <section>
        <button
          onClick={() => setShowTechnical((s) => !s)}
          className="text-sm text-neutral-400 hover:text-neutral-600"
        >
          {showTechnical ? "Hide" : "Show"} technical details
        </button>
        {showTechnical && (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">
            {JSON.stringify(
              {
                stage: project.currentStage,
                status: project.status,
                attempts: project.attempts,
                lastError: project.lastError,
                lease: {
                  workerId: project.leaseWorkerId,
                  expiresAt: project.leaseExpiresAt,
                },
                artifacts: artifacts.map((a) => `${a.type} v${a.version}`),
              },
              null,
              2,
            )}
          </pre>
        )}
      </section>
    </main>
  );
}
