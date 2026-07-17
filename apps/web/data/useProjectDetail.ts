"use client";

import {useMemo} from "react";
import {useQuery} from "convex/react";
import {Artifact, ArtifactType, type Stage, STAGE_LABELS} from "@factory/shared";
import {api} from "@convex/_generated/api";
import type {Doc, Id} from "@convex/_generated/dataModel";

export type ArtifactsMap = {
  [T in ArtifactType]: Artifact<T>[];
}

export interface ProjectDetail {
  project: Doc<"projects">;
  stage: Stage;
  statusMessage: string;
  artifacts: ArtifactsMap;
}

export type ProjectDetailResult =
  { status: "loading" } | { status: "not-found" } | { status: "ready"; detail: ProjectDetail };

export function useProjectDetail(projectId: Id<"projects">): ProjectDetailResult {
  const data = useQuery(api.projects.detail, { projectId });

  const detail = useMemo<ProjectDetail | null>(() => {
    if (!data) return null;
    const stage = data.project.currentStage as Stage;
    const artifactsByType: Partial<Record<ArtifactType, Artifact[]>> = Object.groupBy(data.artifacts, a => a.type);
    const sortedArtifacts = Object.fromEntries(
      Object.entries(artifactsByType)
      .map(([type, artifacts]) => [type, artifacts.sort((a, b) => b.version - a.version)])
    );

    return {
      project: data.project,
      stage,
      statusMessage: data.logs[0]?.message ?? STAGE_LABELS[stage],
      artifacts: sortedArtifacts as ArtifactsMap
    };
  }, [data]);

  if (data === undefined) return {status: 'loading'};
  if (data === null || !detail) return {status: 'not-found'};
  return {status: 'ready', detail};
}
