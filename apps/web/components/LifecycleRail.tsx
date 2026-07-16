"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { isWaitingStage, STAGES, type Stage } from "@factory/shared";
import { PROJECT_PHASES, type ReturnPhase } from "@/helpers/projectPhases";

interface RailStep {
  /** null for the terminal "Site published" step, which is not returnable. */
  id: ReturnPhase | null;
  label: string;
  stageIndex: number;
}

const RAIL_STEPS: RailStep[] = [
  ...PROJECT_PHASES.filter((phase) => phase.id !== "publishing").map((phase) => ({
    id: phase.id,
    label: phase.label,
    stageIndex: STAGES.indexOf(phase.startStage),
  })),
  { id: null, label: "Site published", stageIndex: STAGES.indexOf("Completed") },
];

/**
 * The left sidebar: the project's lifecycle phases with live status. Completed
 * phases are clickable and reopen that phase (via the confirmation dialog).
 */
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
  return (
    <aside className="border-outline relative z-0 hidden w-64 shrink-0 border-r bg-[#f3f4f5] px-5 py-6 lg:block">
      <h2 className="mb-6 text-[11px] font-bold tracking-[0.1em] text-[#596170] uppercase">
        Project progression
      </h2>
      <div className="relative">
        <div className="absolute top-3 bottom-3 left-3 w-px bg-[#c2c6d6]" />
        <ol className="relative space-y-7">
          {RAIL_STEPS.map((step, index) => {
            const nextIndex = RAIL_STEPS[index + 1]?.stageIndex ?? STAGES.length;
            const active = current >= step.stageIndex && current < nextIndex;
            const complete = current >= nextIndex || stage === "Completed";
            const returnPhase = complete ? step.id : null;
            return (
              <li key={step.label}>
                <button
                  className={`flex w-full items-start gap-3 rounded py-1 text-left transition-colors ${returnPhase ? "cursor-pointer hover:bg-[#e7e9ec] focus-visible:ring-2 focus-visible:ring-[#8ab4f8] focus-visible:outline-none" : "cursor-default"}`}
                  disabled={!returnPhase || returningToPhase}
                  onClick={() => returnPhase && onReturnToPhase(returnPhase, step.label)}
                  title={returnPhase ? `Return to ${step.label}` : undefined}
                  type="button"
                >
                  <StepIcon
                    active={active}
                    complete={complete}
                    failed={Boolean(active && lastError)}
                    stage={stage}
                  />
                  <span>
                    <span
                      className={`block text-xs font-semibold ${active ? "text-primary" : complete ? "text-ink" : "text-[#858c98]"}`}
                    >
                      {step.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#737b88]">
                      {stepStatusLabel({
                        active,
                        complete,
                        failed: Boolean(active && lastError),
                        returnable: Boolean(returnPhase),
                        stage,
                      })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

function StepIcon({
  active,
  complete,
  failed,
  stage,
}: {
  active: boolean;
  complete: boolean;
  failed: boolean;
  stage: Stage;
}) {
  const tone = complete
    ? "border-primary bg-primary"
    : failed
      ? "border-[#a82922] bg-[#a82922] ring-4 ring-[#f8d9d6]"
      : active
        ? "border-primary bg-primary ring-4 ring-[#d8e2ff]"
        : "border-[#c2c6d6] bg-[#f3f4f5]";
  return (
    <span
      className={`relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border text-white ${tone}`}
    >
      {complete ? (
        <Check size={13} />
      ) : failed ? (
        <CircleAlert size={13} />
      ) : active ? (
        <LoaderCircle className={isWaitingStage(stage) ? "" : "animate-spin"} size={13} />
      ) : (
        <i className="size-2 rounded-full bg-[#c2c6d6]" />
      )}
    </span>
  );
}

function stepStatusLabel({
  active,
  complete,
  failed,
  returnable,
  stage,
}: {
  active: boolean;
  complete: boolean;
  failed: boolean;
  returnable: boolean;
  stage: Stage;
}) {
  if (active) return failed ? "Failed" : isWaitingStage(stage) ? "Awaiting your input" : "In progress";
  if (complete) return returnable ? "Complete · click to return" : "Complete";
  return "Queued";
}
