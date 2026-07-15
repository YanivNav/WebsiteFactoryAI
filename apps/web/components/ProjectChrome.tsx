"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  LoaderCircle,
  Search,
  UserCircle,
  X,
} from "lucide-react";
import { isWaitingStage, STAGES, STAGE_LABELS, type Stage } from "@factory/shared";
import { PROJECT_PHASES, type ReturnPhase } from "@/helpers/projectPhases";

export function ProjectHeader({ projectTitle, stage }: { projectTitle: string; stage: Stage }) {
  return (
    <header className="border-outline sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Link className="hover:text-primary text-[#596170]" href="/">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-[#8a919d]" />
        <strong className="text-ink truncate">{projectTitle}</strong>
        <span className="text-primary ml-3 hidden rounded border border-[#b9d5fb] bg-[#edf5ff] px-2 py-1 text-[10px] font-bold tracking-[0.08em] uppercase sm:inline">
          {STAGE_LABELS[stage]}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[#283140]">
        <button
          aria-label="Search"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]"
          type="button"
        >
          <Search size={19} />
        </button>
        <button
          aria-label="Help"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3] max-sm:hidden"
          type="button"
        >
          <CircleHelp size={19} />
        </button>
        <button
          aria-label="Account"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]"
          type="button"
        >
          <UserCircle size={20} />
        </button>
      </div>
    </header>
  );
}

export function LifecycleRail({
  lastError,
  onReturnToPhase,
  returningToPhase,
  stage,
}: {
  lastError?: string;
  onReturnToPhase: (phase: ReturnPhase, label: string) => void;
  returningToPhase: boolean;
  stage: Stage;
}) {
  const current = STAGES.indexOf(stage);
  const steps = [
    ...PROJECT_PHASES.filter((phase) => phase.id !== "publishing").map((phase) => ({
      ...phase,
      stageIndex: STAGES.indexOf(phase.startStage),
    })),
    { id: null, label: "Site published", stageIndex: STAGES.indexOf("Completed") },
  ];
  return (
    <aside className="border-outline relative z-0 hidden w-64 shrink-0 border-r bg-[#f3f4f5] px-5 py-6 lg:block">
      <h2 className="mb-6 text-[11px] font-bold tracking-[0.1em] text-[#596170] uppercase">
        Project progression
      </h2>
      <div className="relative">
        <div className="absolute top-3 bottom-3 left-3 w-px bg-[#c2c6d6]" />
        <ol className="relative space-y-7">
          {steps.map((step, index) => {
            const nextIndex = steps[index + 1]?.stageIndex ?? STAGES.length;
            const active = current >= step.stageIndex && current < nextIndex;
            const complete = current >= nextIndex || stage === "Completed";
            const canReturn = complete && step.id !== null;
            return (
              <li key={step.label}>
                <div
                  className={`flex w-full items-start gap-3 rounded py-1 text-left transition-colors ${canReturn ? "cursor-pointer hover:bg-[#e7e9ec] focus-visible:ring-2 focus-visible:ring-[#8ab4f8] focus-visible:outline-none" : "cursor-default"}`}
                  onClick={() => {
                    if (canReturn && !returningToPhase && step.id) {
                      onReturnToPhase(step.id as ReturnPhase, step.label);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      canReturn &&
                      !returningToPhase &&
                      step.id &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onReturnToPhase(step.id as ReturnPhase, step.label);
                    }
                  }}
                  role={canReturn ? "button" : undefined}
                  tabIndex={canReturn && !returningToPhase ? 0 : undefined}
                  title={canReturn ? `Return to ${step.label}` : undefined}
                >
                  <span
                    className={`relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border text-white ${complete ? "border-primary bg-primary" : active ? "border-primary bg-primary ring-4 ring-[#d8e2ff]" : "border-[#c2c6d6] bg-[#f3f4f5]"}`}
                  >
                    {complete ? (
                      <Check size={13} />
                    ) : active ? (
                      <LoaderCircle
                        className={isWaitingStage(stage) ? "" : "animate-spin"}
                        size={13}
                      />
                    ) : (
                      <i className="size-2 rounded-full bg-[#c2c6d6]" />
                    )}
                  </span>
                  <div>
                    <p
                      className={`text-xs font-semibold ${active ? "text-primary" : complete ? "text-ink" : "text-[#858c98]"}`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#737b88]">
                      {active
                        ? isWaitingStage(stage)
                          ? "Awaiting your input"
                          : "In progress"
                        : complete
                          ? canReturn
                            ? "Complete · click to return"
                            : "Complete"
                          : "Queued"}
                    </p>
                    {active && lastError && (
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#a82922]">
                        <CircleAlert size={12} />
                        Failed
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

export function ReturnToPhaseDialog({
  label,
  onCancel,
  onConfirm,
  submitting,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
}) {
  return (
    <div
      aria-labelledby="return-phase-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#17191c]/45 p-4 backdrop-blur-[2px]"
      role="dialog"
    >
      <section className="border-outline w-full max-w-md rounded-lg border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e1e3e6] p-5">
          <div>
            <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
              Project progression
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]" id="return-phase-title">
              Return to {label}?
            </h2>
          </div>
          <button
            aria-label="Close dialog"
            className="grid size-8 shrink-0 place-items-center rounded text-[#596170] hover:bg-[#f0f1f3]"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm leading-5 text-[#596170]">
            The latest saved {label.toLowerCase()} will reopen. Work from later phases stays in the
            project, so nothing is deleted.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              className="border-outline min-h-10 rounded border bg-white px-5 text-xs font-semibold hover:bg-[#f1f2f4] disabled:opacity-50"
              disabled={submitting}
              onClick={onCancel}
              type="button"
            >
              Keep current phase
            </button>
            <button
              className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-50"
              disabled={submitting}
              onClick={() => void onConfirm()}
              type="button"
            >
              {submitting && <LoaderCircle className="animate-spin" size={14} />}
              Return to {label}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
