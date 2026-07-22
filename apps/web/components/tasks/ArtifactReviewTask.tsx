"use client";

import { useState } from "react";
import { CheckCircle2, PencilLine } from "lucide-react";
import { PHASE_REVIEW_ARTIFACT, type ArtifactType } from "@factory/shared";
import type { Id } from "@convex/_generated/dataModel";
import { ArtifactReview } from "@/components/ArtifactReview";
import { useUserTask } from "@/data/useUserTask";
import type { UserTaskViewProps } from "./UserTaskView";
import { ActivityActions } from "../activities/ActivityActions";
import { ArtifactContent } from "../activities/ArtifactContent";

export function ArtifactReviewTask({ detail, task, viewedArtifactId, onViewArtifact }: UserTaskViewProps) {
  const subject = findArtifact(detail, task.subjectArtifactId);
  const { complete, revise, deleteVersion, busy } = useUserTask();
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");

  // The subject may have been deleted — fall back to the type this phase reviews.
  const artifactType: ArtifactType | undefined = subject?.type ?? PHASE_REVIEW_ARTIFACT[task.phase];
  if (!artifactType) return <MissingArtifact />;
  const versions = detail.artifacts[artifactType] ?? [];
  if (versions.length === 0) return <MissingArtifact />;

  return (
    <ArtifactReview
      approvedArtifactId={detail.approvedArtifactIds[artifactType]}
      onView={onViewArtifact}
      proposedArtifactId={subject?.id ?? versions[0].id}
      viewedArtifactId={viewedArtifactId}
      renderActions={(artifact) => (
        <>
          {revising && (
            <section className="border-outline rounded border bg-white p-4">
              <label className="text-ink text-sm font-medium">What should change?</label>
              <textarea
                autoFocus
                className="border-outline bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary mt-2 block w-full rounded border px-3 py-2 text-sm outline-none focus:ring-1"
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Describe the changes this version should address…"
                rows={3}
                value={feedback}
              />
            </section>
          )}
          <ActivityActions
            primary={{
              label: versions.length > 1 ? `Continue with Version ${artifact.version}` : 'Continue',
              icon: <CheckCircle2 size={16} />,
              loading: busy === "complete",
              disabled: busy !== null,
              onClick: () =>
                void complete({
                  userTaskId: task._id,
                  artifactId: artifact.id as Id<"artifacts">,
                }),
            }}
            secondary={
              revising
                ? {
                    label: "Send changes",
                    loading: busy === "revise",
                    disabled: busy !== null || !feedback.trim(),
                    onClick: () =>
                      void revise({
                        userTaskId: task._id,
                        sourceArtifactId: artifact.id as Id<"artifacts">,
                        feedback,
                      }),
                  }
                : {
                    label: "Request changes",
                    icon: <PencilLine size={16} />,
                    disabled: busy !== null,
                    onClick: () => setRevising(true),
                  }
            }
            remove={
              versions.length > 1
                ? {
                    label: "Delete Version",
                    loading: busy === "delete",
                    disabled: busy !== null,
                    onClick: () =>
                      void deleteVersion({
                        artifactId: artifact.id as Id<"artifacts">,
                      }),
                  }
                : undefined
            }
          />
        </>
      )}
      renderArtifact={(artifact) => (
        <ArtifactContent artifact={artifact} versions={versions} taskId={task._id} detail={detail} />
      )}
      versionLabel="Versions"
      versions={versions}
    />
  );
}

function findArtifact(detail: UserTaskViewProps["detail"], artifactId?: Id<"artifacts">) {
  if (!artifactId) return undefined;
  return Object.values(detail.artifacts)
    .flat()
    .find((artifact) => artifact.id === artifactId);
}

function MissingArtifact() {
  return (
    <section className="border-outline rounded border bg-white p-5 text-sm text-red-700">
      This saved version is no longer available.
    </section>
  );
}
