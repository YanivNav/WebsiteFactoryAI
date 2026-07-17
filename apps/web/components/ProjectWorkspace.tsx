"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { isWaitingStage, STAGE_LABELS } from "@factory/shared";
import type { ProjectDetail } from "@/data/useProjectDetail";
import {api} from "@convex/_generated/api";
import {useMutation} from "convex/react";

export function ProjectWorkspace({
  detail
}: {
  detail: ProjectDetail
}) {
  const continueFromGate = useMutation(api.projects.continueFromGate);
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);
  const { project, stage, statusMessage } = detail;
  const completed = stage === "Completed";
  const waiting = isWaitingStage(stage) && !completed;

  return (
    <section className="border-outline rounded border bg-white p-6">
      <div className="flex items-start gap-4">
        <StatusIcon completed={completed} failed={project.status === "failed"} waiting={waiting} />
        <div className="min-w-0 flex-1">
          <p className="text-primary text-[10px] font-bold tracking-widest uppercase">
            {project.status === "failed"
              ? "Worker stopped"
              : completed
                ? "Project complete"
                : waiting
                  ? "Waiting for you"
                  : "Worker active"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{STAGE_LABELS[stage]}</h1>
          
        </div>
      </div>
    </section>
  );
}

function StatusIcon({
  completed,
  failed,
  waiting,
}: {
  completed: boolean;
  failed: boolean;
  waiting: boolean;
}) {
  const className = `grid size-11 shrink-0 place-items-center rounded-full ${
    failed
      ? "bg-[#f8d9d6] text-[#a82922]"
      : completed
        ? "bg-[#def3e6] text-[#17693a]"
        : "bg-[#d8e2ff] text-primary"
  }`;
  if (failed)
    return (
      <span className={className}>
        <CircleAlert size={21} />
      </span>
    );
  if (completed)
    return (
      <span className={className}>
        <Check size={21} />
      </span>
    );
  return (
    <span className={className}>
      <LoaderCircle className={waiting ? "" : "animate-spin"} size={21} />
    </span>
  );
}
