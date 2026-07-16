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
  blockingTasks: Array<Doc<"manualTasks">>;
  changeRequests: Array<Doc<"changeRequests">>;
  designProgress: DesignScreenView[];
  /** storageId → URL for design artifact assets (screenshots, HTML). */
  assetUrls: Record<string, string | null>;
}

export type ProjectDetailResult =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; detail: ProjectDetail };

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

    return {
      project: data.project,
      stage,
      statusMessage: data.logs[0]?.message ?? STAGE_LABELS[stage],
      pendingReview,
      specificationVersions,
      designVersions,
      questions: artifactVersions<QuestionSet>(data.artifacts, "questions")[0]?.data,
      blockingTasks: data.manualTasks.filter((task) => !task.completed),
      changeRequests: data.changeRequests,
      designProgress: data.designProgress,
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
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);

  return useMemo(
    () => ({
      approveReview: (reviewId: Id<"reviews">) => approve({ reviewId }),
      requestChanges: (reviewId: Id<"reviews">, feedback: ReviewFeedback[]) =>
        requestChanges({ reviewId, feedback }),
      reviseSpecification: (reviewId: Id<"reviews">, specification: Specification) =>
        reviseSpecification({ reviewId, specification }),
      completeTask: (taskId: Id<"manualTasks">) => completeTask({ taskId }),
      createChangeRequest: (description: string) =>
        createChangeRequest({ projectId, description }),
      submitAnswers: (answers: Array<{ questionId: string; value: string }>) =>
        submitAnswers({ projectId, answers }),
      returnToPhase: (phase: Parameters<typeof returnToPhase>[0]["phase"]) =>
        returnToPhase({ projectId, phase }),
      retryCurrentStage: () => retryCurrentStage({ projectId }),
    }),
    [
      approve,
      completeTask,
      createChangeRequest,
      projectId,
      requestChanges,
      retryCurrentStage,
      returnToPhase,
      reviseSpecification,
      submitAnswers,
    ],
  );
}
