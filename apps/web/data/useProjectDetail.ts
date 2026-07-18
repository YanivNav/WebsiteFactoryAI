"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { ARTIFACT_TYPES, type Artifact, type ArtifactType, type Phase } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

export type ArtifactsMap = { [T in ArtifactType]: Artifact<T>[] };
export type ActivityStatus = "draft" | "working" | "waiting" | "failed" | "completed";

export interface ProjectDetail {
  project: Doc<"projects">;
  phase: Phase;
  activityLabel: string;
  activityStatus: ActivityStatus;
  currentWork?: Doc<"works">;
  currentUserTask?: Doc<"userTasks">;
  works: Doc<"works">[];
  userTasks: Doc<"userTasks">[];
  progress?: Doc<"workProgress">;
  logs: Doc<"logs">[];
  artifacts: ArtifactsMap;
  approvedArtifactIds: Partial<Record<ArtifactType, string>>;
}

export type ProjectDetailResult =
  { status: "loading" } | { status: "not-found" } | { status: "ready"; detail: ProjectDetail };

export function useProjectDetail(projectId: Id<"projects">): ProjectDetailResult {
  const data = useQuery(api.projects.detail, { projectId });

  const detail = useMemo<ProjectDetail | null>(() => {
    if (!data) return null;
    const groups = Object.groupBy(data.artifacts, (artifact) => artifact.type);
    const artifacts = Object.fromEntries(
      ARTIFACT_TYPES.map((type) => [
        type,
        groups[type]?.toSorted((a, b) => b.version - a.version) ?? [],
      ]),
    ) as ArtifactsMap;

    const activity = describeActivity(data.project, data.currentWork, data.currentUserTask);
    return {
      project: data.project,
      phase: activity.phase,
      activityLabel: activity.label,
      activityStatus: activity.status,
      currentWork: data.currentWork ?? undefined,
      currentUserTask: data.currentUserTask ?? undefined,
      works: data.works,
      userTasks: data.userTasks,
      progress: data.progress ?? undefined,
      logs: data.logs,
      artifacts,
      approvedArtifactIds: data.project.approvedArtifacts,
    };
  }, [data]);

  if (data === undefined) return { status: "loading" };
  if (data === null || !detail) return { status: "not-found" };
  return { status: "ready", detail };
}

function describeActivity(
  project: Doc<"projects">,
  work?: Doc<"works"> | null,
  task?: Doc<"userTasks"> | null,
): { phase: Phase; label: string; status: ActivityStatus } {
  if (project.currentActivity.type === "draft") {
    return { phase: "sitePlan", label: "Draft", status: "draft" };
  }
  if (project.currentActivity.type === "completed") {
    return { phase: "publishing", label: "Live", status: "completed" };
  }
  if (project.currentActivity.type === "userTask" && task) {
    return { phase: task.phase, label: task.label, status: "waiting" };
  }
  if (work) {
    return {
      phase: work.phase,
      label: work.label,
      status: work.status === "failed" ? "failed" : "working",
    };
  }
  return { phase: "sitePlan", label: "Project unavailable", status: "failed" };
}
