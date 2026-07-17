"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { STAGE_LABELS, type Stage } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

export interface ProjectDetail {
  project: Doc<"projects">;
  stage: Stage;
  statusMessage: string;
}

export type ProjectDetailResult =
  { status: "loading" } | { status: "not-found" } | { status: "ready"; detail: ProjectDetail };

export function useProjectDetail(projectId: Id<"projects">): ProjectDetailResult {
  const data = useQuery(api.projects.detail, { projectId });
  if (data === undefined) return { status: "loading" };
  if (data === null) return { status: "not-found" };

  const stage = data.project.currentStage as Stage;
  return {
    status: "ready",
    detail: {
      project: data.project,
      stage,
      statusMessage: data.logs[0]?.message ?? STAGE_LABELS[stage],
    },
  };
}

export function useProjectActions(projectId: Id<"projects">) {
  const continueFromGate = useMutation(api.projects.continueFromGate);
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);

  return useMemo(
    () => ({
      continueFromGate: () => continueFromGate({ projectId }),
      retryCurrentStage: () => retryCurrentStage({ projectId }),
    }),
    [continueFromGate, projectId, retryCurrentStage],
  );
}
