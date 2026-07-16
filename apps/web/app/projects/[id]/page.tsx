"use client";

import { use, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useProjectActions, useProjectDetail, type ProjectDetail } from "@/data/useProjectDetail";
import { LifecycleRail } from "@/components/LifecycleRail";
import { LiveWorkspace } from "@/components/LiveWorkspace";
import { ManualActions } from "@/components/ManualActions";
import { ProjectHeader } from "@/components/ProjectHeader";
import { QuickQuestions } from "@/components/QuickQuestions";
import { ReturnToPhaseDialog } from "@/components/ReturnToPhaseDialog";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { WorkingWorkspace } from "@/components/WorkingWorkspace";
import type { ReturnPhase } from "@/helpers/projectPhases";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const result = useProjectDetail(projectId);
  const actions = useProjectActions(projectId);
  const [pendingPhaseReturn, setPendingPhaseReturn] = useState<{
    phase: ReturnPhase;
    label: string;
  } | null>(null);
  const [returningToPhase, setReturningToPhase] = useState(false);

  if (result.status === "loading")
    return (
      <CenteredState>
        <LoaderCircle className="animate-spin" />
        Loading project…
      </CenteredState>
    );
  if (result.status === "not-found")
    return (
      <CenteredState>
        <CircleAlert />
        Project not found.
      </CenteredState>
    );

  const { detail } = result;

  async function confirmPhaseReturn() {
    if (!pendingPhaseReturn) return;
    setReturningToPhase(true);
    try {
      await actions.returnToPhase(pendingPhaseReturn.phase);
      setPendingPhaseReturn(null);
    } finally {
      setReturningToPhase(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <ProjectHeader projectTitle={detail.project.title} stage={detail.stage} />
      <div className="flex min-h-[calc(100vh-56px)]">
        <LifecycleRail
          lastError={detail.project.lastError}
          onReturnToPhase={(phase, label) => setPendingPhaseReturn({ phase, label })}
          returningToPhase={returningToPhase}
          stage={detail.stage}
        />
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            <Workspace actions={actions} detail={detail} />
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

/** Exactly one workspace is active at a time; this is the whole routing table. */
function Workspace({
  actions,
  detail,
}: {
  actions: ReturnType<typeof useProjectActions>;
  detail: ProjectDetail;
}) {
  if (detail.pendingReview) {
    const review = detail.pendingReview;
    return (
      <ReviewWorkspace
        assetUrls={detail.assetUrls}
        designVersions={detail.designVersions}
        key={review.id}
        onApprove={() => actions.approveReview(review.id)}
        onRequestChanges={(feedback) => actions.requestChanges(review.id, feedback)}
        onReviseSpecification={(spec) => actions.reviseSpecification(review.id, spec)}
        project={detail.project}
        review={review}
        specificationVersions={detail.specificationVersions}
      />
    );
  }
  if (detail.stage === "WaitingForAnswers" && detail.questions) {
    return (
      <QuickQuestions
        onSubmit={actions.submitAnswers}
        projectTitle={detail.project.title}
        questions={detail.questions}
      />
    );
  }
  if (detail.stage === "WaitingForManualActions" && detail.blockingTasks.length > 0) {
    return (
      <ManualActions
        onComplete={actions.completeTask}
        projectTitle={detail.project.title}
        tasks={detail.blockingTasks}
      />
    );
  }
  if (detail.stage === "Completed") {
    return (
      <LiveWorkspace
        changeRequests={detail.changeRequests}
        onSubmitChange={actions.createChangeRequest}
        project={detail.project}
      />
    );
  }
  return <WorkingWorkspace detail={detail} onRetry={actions.retryCurrentStage} />;
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-[#697181]">
      {children}
    </div>
  );
}
