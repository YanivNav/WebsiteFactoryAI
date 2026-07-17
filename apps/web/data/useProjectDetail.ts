"use client";

/**
 * The dashboard's data layer. Convex hooks are ALLOWED in the dashboard (realtime is
 * why we picked Convex) but they stay confined to this directory — components receive
 * typed view models and never see raw table rows, `data: any`, or sorting logic.
 *
 * Every cast from `data: any` to a real artifact type happens here, once.
 */

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  STAGE_LABELS,
  type Design,
  type DesignScreenStatus,
  type QuestionSet,
  type ReviewFeedback,
  type QaReport,
  type SolutionArchitecture,
  type Specification,
  type Stage,
} from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

export interface ArtifactVersion<T> {
  version: number;
  data: T;
}

/** One screen of a live design run, ready to render. */
export interface DesignScreenView {
  pageTitle: string;
  pagePath: string;
  status: DesignScreenStatus;
  screenshotUrl: string | null;
}

export interface StageProgressView {
  label: string;
  percent: number;
}

/** The review gate the user is currently sitting at, with the artifact under review. */
export interface PendingReview {
  id: Id<"reviews">;
  artifactType: "specification" | "design" | "preview";
  version: number;
  specification?: Specification;
  design?: Design;
}

export interface ProjectDetail {
  project: Doc<"projects">;
  stage: Stage;
  /** Latest activity-feed line; falls back to the stage label. Display only. */
  statusMessage: string;
  pendingReview: PendingReview | null;
  specificationVersions: Array<ArtifactVersion<Specification>>;
  designVersions: Array<ArtifactVersion<Design>>;
  questions: QuestionSet | undefined;
  manualTasks: Array<Doc<"manualTasks">>;
  blockingTasks: Array<Doc<"manualTasks">>;
  changeRequests: Array<Doc<"changeRequests">>;
  designProgress: DesignScreenView[];
  stageProgress: StageProgressView | null;
  solutionArchitecture: SolutionArchitecture | undefined;
  websiteQaReport: QaReport | undefined;
  /** storageId → URL for design artifact assets (screenshots, HTML). */
  assetUrls: Record<string, string | null>;
}

export type ProjectDetailResult =
  { status: "loading" } | { status: "not-found" } | { status: "ready"; detail: ProjectDetail };

export function useProjectDetail(projectId: Id<"projects">): ProjectDetailResult {
  const data = useQuery(api.projects.detail, { projectId });

  const detail = useMemo<ProjectDetail | null>(() => {
    if (!data) return null;
    const stage = data.project.currentStage as Stage;

    const specificationVersions = artifactVersions<Specification>(data.artifacts, "specification");
    const designVersions = artifactVersions<Design>(data.artifacts, "design");

    const waiting = data.pendingReview;
    const reviewedArtifact = waiting
      ? data.artifacts.find((artifact) => artifact._id === waiting.artifactId)
      : undefined;
    const pendingReview: PendingReview | null =
      waiting && reviewedArtifact
        ? {
            id: waiting._id,
            artifactType: waiting.artifactType as PendingReview["artifactType"],
            version: waiting.version,
            specification:
              waiting.artifactType === "specification"
                ? (reviewedArtifact.data as Specification)
                : undefined,
            design:
              waiting.artifactType === "design" ? (reviewedArtifact.data as Design) : undefined,
          }
        : null;

    const attemptBoundary = data.logs.findIndex((log) => {
      const kind = (log.data as { kind?: string } | undefined)?.kind;
      return kind === "attempt-started" || kind === "retry-requested";
    });
    const currentAttemptLogs =
      attemptBoundary >= 0 ? data.logs.slice(0, attemptBoundary) : data.logs;
    const progressLog = currentAttemptLogs.find(
      (log) => (log.data as { kind?: string } | undefined)?.kind === "stage-progress",
    );
    const progressData = progressLog?.data as
      { kind: "stage-progress"; percent?: number; label?: string } | undefined;
    const activeManualTasks = data.manualTasks.filter((task) => task.active !== false);

    return {
      project: data.project,
      stage,
      statusMessage: data.logs[0]?.message ?? STAGE_LABELS[stage],
      pendingReview,
      specificationVersions,
      designVersions,
      questions: artifactVersions<QuestionSet>(data.artifacts, "questions")[0]?.data,
      manualTasks: [...activeManualTasks].sort((a, b) => a._creationTime - b._creationTime),
      blockingTasks: activeManualTasks.filter((task) => !task.completed),
      changeRequests: data.changeRequests,
      designProgress: data.designProgress,
      stageProgress:
        typeof progressData?.percent === "number"
          ? {
              label: progressData.label ?? progressLog?.message ?? STAGE_LABELS[stage],
              percent: Math.max(0, Math.min(100, progressData.percent)),
            }
          : null,
      solutionArchitecture: artifactVersions<SolutionArchitecture>(
        data.artifacts,
        "wixSolutionArchitecture",
      )[0]?.data,
      websiteQaReport: artifactVersions<QaReport>(data.artifacts, "websiteQaReport")[0]?.data,
      assetUrls: data.assetUrls,
    };
  }, [data]);

  if (data === undefined) return { status: "loading" };
  if (data === null || !detail) return { status: "not-found" };
  return { status: "ready", detail };
}

/** All versions of one artifact type, newest first, cast to its real shape once. */
function artifactVersions<T>(
  artifacts: Array<Doc<"artifacts">>,
  type: Doc<"artifacts">["type"],
): Array<ArtifactVersion<T>> {
  return artifacts
    .filter((artifact) => artifact.type === type)
    .sort((a, b) => b.version - a.version)
    .map((artifact) => ({ version: artifact.version, data: artifact.data as T }));
}

/** Everything the project page can DO, so components call named actions, not mutations. */
export function useProjectActions(projectId: Id<"projects">) {
  const approve = useMutation(api.reviews.approve);
  const requestChanges = useMutation(api.reviews.requestChanges);
  const reviseSpecification = useMutation(api.reviews.reviseSpecification);
  const completeTask = useMutation(api.manualTasks.complete);
  const createChangeRequest = useMutation(api.changeRequests.create);
  const submitAnswers = useMutation(api.projects.submitAnswers);
  const returnToPhase = useMutation(api.projects.returnToPhase);
  const restartFromBrief = useMutation(api.projects.restartFromBrief);
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);

  return useMemo(
    () => ({
      approveReview: (reviewId: Id<"reviews">) => approve({ reviewId }),
      requestChanges: (reviewId: Id<"reviews">, feedback: ReviewFeedback[]) =>
        requestChanges({ reviewId, feedback }),
      reviseSpecification: (reviewId: Id<"reviews">, specification: Specification) =>
        reviseSpecification({ reviewId, specification }),
      completeTask: (taskId: Id<"manualTasks">, configurationValue?: string) =>
        completeTask({ taskId, configurationValue }),
      createChangeRequest: (description: string) => createChangeRequest({ projectId, description }),
      submitAnswers: (answers: Array<{ questionId: string; value: string }>) =>
        submitAnswers({ projectId, answers }),
      returnToPhase: (phase: Parameters<typeof returnToPhase>[0]["phase"]) =>
        returnToPhase({ projectId, phase }),
      restartFromBrief: () => restartFromBrief({ projectId }),
      retryCurrentStage: () => retryCurrentStage({ projectId }),
    }),
    [
      approve,
      completeTask,
      createChangeRequest,
      projectId,
      requestChanges,
      restartFromBrief,
      retryCurrentStage,
      returnToPhase,
      reviseSpecification,
      submitAnswers,
    ],
  );
}
