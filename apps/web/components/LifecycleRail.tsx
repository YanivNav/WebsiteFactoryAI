"use client";

import { Check, LoaderCircle } from "lucide-react";
import { isWaitingStage, STAGES, type Stage } from "@factory/shared";
import { PROJECT_PHASES } from "@/helpers/projectPhases";

const RAIL_STEPS = [
  ...PROJECT_PHASES.map((phase) => ({
    label: phase.label,
    stageIndex: STAGES.indexOf(phase.startStage),
  })),
  { label: "Site published", stageIndex: STAGES.indexOf("Completed") },
];

/** Read-only lifecycle timeline. Stage-specific controls belong in the main panel. */
export function LifecycleRail({ stage }: { stage: Stage }) {
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
            return (
              <li className="flex items-start gap-3" key={step.label}>
                <StepIcon active={active} complete={complete} waiting={isWaitingStage(stage)} />
                <span>
                  <span
                    className={`block text-xs font-semibold ${
                      active ? "text-primary" : complete ? "text-ink" : "text-[#858c98]"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#737b88]">
                    {complete
                      ? "Complete"
                      : active
                        ? isWaitingStage(stage)
                          ? "Waiting"
                          : "In progress"
                        : "Queued"}
                  </span>
                </span>
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
  waiting,
}: {
  active: boolean;
  complete: boolean;
  waiting: boolean;
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
        <LoaderCircle className={waiting ? "" : "animate-spin"} size={13} />
      ) : (
        <i className="size-2 rounded-full bg-[#c2c6d6]" />
      )}
    </span>
  );
}
