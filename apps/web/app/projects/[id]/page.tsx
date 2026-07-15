"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type Design, type QuestionSet, type Specification, type Stage } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LifecycleRail, ProjectHeader, ReturnToPhaseDialog } from "@/components/ProjectChrome";
import { WorkingWorkspace } from "@/components/WorkingWorkspace";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";
import { LiveWorkspace, ManualActions, QuickQuestions } from "@/components/StageViews";
import type { ReturnPhase } from "./helpers/projectPhases";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const data = useQuery(api.projects.detail, { projectId });
  const approve = useMutation(api.reviews.approve);
  const requestChanges = useMutation(api.reviews.requestChanges);
  const completeTask = useMutation(api.manualTasks.complete);
  const requestChange = useMutation(api.changeRequests.create);
  const submitAnswers = useMutation(api.projects.submitAnswers);
  const reviseSpecification = useMutation(api.reviews.reviseSpecification);
  const returnToPhase = useMutation(api.projects.returnToPhase);
  const retryCurrentStage = useMutation(api.projects.retryCurrentStage);
  const [comment, setComment] = useState("");
  const [change, setChange] = useState("");
  const [returningToPhase, setReturningToPhase] = useState(false);
  const [pendingPhaseReturn, setPendingPhaseReturn] = useState<{
    phase: ReturnPhase;
    label: string;
  } | null>(null);

  if (data === undefined)
    return (
      <CenteredState>
        <LoaderCircle className="animate-spin" />
        Loading project…
      </CenteredState>
    );
  if (data === null)
    return (
      <CenteredState>
        <CircleAlert />
        Project not found.
      </CenteredState>
    );

  const {
    project,
    logs,
    manualTasks,
    artifacts,
    reviews,
    pendingReview,
    changeRequests,
    assetUrls,
  } = data;
  const stage = project.currentStage as Stage;
  const blockingTasks = manualTasks.filter((task) => !task.completed);
  const reviewedArtifact = pendingReview
    ? artifacts.find((artifact) => artifact._id === pendingReview.artifactId)
    : undefined;
  const specification =
    reviewedArtifact && pendingReview?.artifactType === "specification"
      ? (reviewedArtifact.data as Specification)
      : undefined;
  const reviewedDesign =
    reviewedArtifact && pendingReview?.artifactType === "design"
      ? (reviewedArtifact.data as Design)
      : undefined;
  const questionArtifact = artifacts
    .filter((artifact) => artifact.type === "questions")
    .sort((a, b) => b.version - a.version)[0];
  const questions = questionArtifact?.data as QuestionSet | undefined;
  const specificationVersions = artifacts
    .filter((artifact) => artifact.type === "specification")
    .sort((a, b) => b.version - a.version)
    .map((artifact) => ({ version: artifact.version, data: artifact.data as Specification }));
  const designVersions = artifacts
    .filter((artifact) => artifact.type === "design")
    .sort((a, b) => b.version - a.version)
    .map((artifact) => ({ version: artifact.version, data: artifact.data as Design }));
  const latestDesignFeedback = reviews
    .filter((review) => review.artifactType === "design" && review.status === "needs_changes")
    .sort((a, b) => b._creationTime - a._creationTime)[0];
  const targetedDesignRevision = latestDesignFeedback?.comments.every((item) => {
    try {
      return (JSON.parse(item) as { kind?: string }).kind === "screen-feedback";
    } catch {
      return false;
    }
  });

  async function submitReviewChanges() {
    if (!pendingReview || !comment.trim()) return;
    await requestChanges({ reviewId: pendingReview._id, comments: [comment.trim()] });
    setComment("");
  }

  async function submitChange() {
    if (!change.trim()) return;
    await requestChange({ projectId, description: change.trim() });
    setChange("");
  }

  function goBackToPhase(phase: ReturnPhase, label: string) {
    setPendingPhaseReturn({ phase, label });
  }

  async function confirmPhaseReturn() {
    if (!pendingPhaseReturn) return;
    setReturningToPhase(true);
    try {
      await returnToPhase({ projectId, phase: pendingPhaseReturn.phase });
      setPendingPhaseReturn(null);
    } finally {
      setReturningToPhase(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <ProjectHeader projectTitle={project.title} stage={stage} />
      <div className="flex min-h-[calc(100vh-56px)]">
        <LifecycleRail
          lastError={project.lastError}
          onReturnToPhase={goBackToPhase}
          returningToPhase={returningToPhase}
          stage={stage}
        />
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            {pendingReview && (
              <ReviewWorkspace
                artifactType={pendingReview.artifactType}
                comment={comment}
                assetUrls={assetUrls}
                design={reviewedDesign}
                designVersions={designVersions}
                key={pendingReview._id}
                onApprove={() => approve({ reviewId: pendingReview._id })}
                onCommentChange={setComment}
                onRequestChanges={submitReviewChanges}
                onReviseScreen={(screen, screenComment) =>
                  requestChanges({
                    reviewId: pendingReview._id,
                    comments: [
                      JSON.stringify({
                        kind: "screen-feedback",
                        screenId: screen.stitchScreenId,
                        pageTitle: screen.pageTitle,
                        comment: screenComment,
                      }),
                    ],
                  })
                }
                project={project}
                specification={specification}
                specificationVersions={specificationVersions}
                onReviseSpecification={(spec) =>
                  pendingReview
                    ? reviseSpecification({ reviewId: pendingReview._id, specification: spec })
                    : Promise.resolve()
                }
                version={pendingReview.version}
              />
            )}

            {stage === "WaitingForAnswers" && questions && (
              <QuickQuestions
                onSubmit={(answers) => submitAnswers({ projectId, answers })}
                projectTitle={project.title}
                questions={questions}
              />
            )}

            {stage === "WaitingForManualActions" && blockingTasks.length > 0 && (
              <ManualActions
                tasks={blockingTasks}
                onComplete={(taskId) => completeTask({ taskId })}
                projectTitle={project.title}
              />
            )}

            {stage === "Completed" && (
              <LiveWorkspace
                change={change}
                changeRequests={changeRequests}
                onChange={setChange}
                onSubmit={submitChange}
                project={project}
              />
            )}

            {!pendingReview &&
              stage !== "WaitingForAnswers" &&
              stage !== "WaitingForManualActions" &&
              stage !== "Completed" && (
                <WorkingWorkspace
                  assetUrls={assetUrls}
                  attempts={project.attempts}
                  lastError={project.lastError}
                  logs={logs}
                  plannedDesignScreens={specificationVersions[0]?.data.pages.map((page) => ({
                    pageTitle: page.title,
                    pagePath: page.path,
                  }))}
                  previousDesignScreens={
                    targetedDesignRevision ? designVersions[0]?.data.screens : undefined
                  }
                  onRetry={() => retryCurrentStage({ projectId })}
                  projectTitle={project.title}
                  stage={stage}
                />
              )}
          </div>
        </main>
      </div>
      {pendingPhaseReturn && (
        <ReturnToPhaseDialog
          label={pendingPhaseReturn.label}
          onCancel={() => setPendingPhaseReturn(null)}
          onConfirm={confirmPhaseReturn}
          submitting={returningToPhase}
        />
      )}
    </div>
  );
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-[#697181]">
      {children}
    </div>
  );
}
