"use client";

import { CircleAlert, Rocket } from "lucide-react";
import { STAGE_LABELS, type Stage } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { STAGE_PROGRESS_VIEWS } from "./progress";
import { DefaultProgress } from "./progress/DefaultProgress";

const MAX_ATTEMPTS = 3;

/**
 * Shown while the worker owns the project: failure/working banners, then the
 * progress view registered for the current stage (see `components/progress`).
 */
export function WorkingWorkspace({
  detail,
  onRetry,
}: {
  detail: ProjectDetail;
  onRetry: () => Promise<unknown>;
}) {
  const { lastError } = detail.project;
  const retriesExhausted = detail.project.attempts >= MAX_ATTEMPTS;
  const ProgressView = STAGE_PROGRESS_VIEWS[detail.stage] ?? DefaultProgress;
  return (
    <div className="space-y-5">
      {(lastError || retriesExhausted) && (
        <FailureBanner
          lastError={lastError}
          onRetry={onRetry}
          retriesExhausted={retriesExhausted}
        />
      )}
      {!retriesExhausted && (
        <WorkingBanner projectTitle={detail.project.title} stage={detail.stage} />
      )}
      <ProgressView detail={detail} />
    </div>
  );
}

function FailureBanner({
  lastError,
  onRetry,
  retriesExhausted,
}: {
  lastError?: string;
  onRetry: () => Promise<unknown>;
  retriesExhausted: boolean;
}) {
  return (
    <section className="rounded border border-[#e4aaa6] bg-[#fff3f2] p-5">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 shrink-0 text-[#a82922]" size={20} />
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.1em] text-[#a82922] uppercase">
            This step failed
          </p>
          <h2 className="mt-1 text-base font-semibold">
            {retriesExhausted ? "Automatic retries stopped" : "We’re retrying automatically"}
          </h2>
          <p className="mt-2 text-sm leading-5 break-words text-[#713631]">
            {lastError ?? "This step reached the automatic retry limit."}
          </p>
          {retriesExhausted && (
            <button
              className="mt-4 rounded bg-[#a82922] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8f211c]"
              onClick={() => void onRetry()}
              type="button"
            >
              Retry this step
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkingBanner({ projectTitle, stage }: { projectTitle: string; stage: Stage }) {
  return (
    <section className="border-outline rounded border bg-white p-6">
      <div className="flex items-start gap-4">
        <div className="text-primary grid size-11 shrink-0 place-items-center rounded-full bg-[#d8e2ff]">
          <Rocket className="animate-pulse" size={21} />
        </div>
        <div>
          <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
            Working automatically
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{STAGE_LABELS[stage]}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[#596170]">
            {projectTitle} is moving forward. You don’t need to do anything right now; this page
            will update as soon as the next review or Wix task is ready.
          </p>
        </div>
      </div>
    </section>
  );
}
