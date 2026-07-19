"use client";

import type { Id } from "@convex/_generated/dataModel";
import { ArtifactReview } from "@/components/ArtifactReview";
import { useUserTask } from "@/data/useUserTask";
import type { UserTaskViewProps } from "./UserTaskView";
import { ArtifactEditor } from "./ArtifactContent";

export function ArtifactSubmissionTask({ detail, task, viewedArtifactId, onViewArtifact }: UserTaskViewProps) {
  const subject = findArtifact(detail, task.subjectArtifactId);
  const previousResult = findArtifact(detail, task.previousResultArtifactId);
  const { complete, revise, busy } = useUserTask();
  if (!subject) return <MissingEditor label="This saved version is no longer available." />;

  const versions = detail.artifacts[subject.type];

  return (
    <ArtifactReview
      onView={onViewArtifact}
      proposedArtifactId={subject.id}
      viewedArtifactId={viewedArtifactId}
      renderArtifact={(artifact) => (
        <ArtifactEditor
          artifact={artifact}
          busy={busy}
          onRegenerate={() =>
            void revise({
              userTaskId: task._id,
              sourceArtifactId: artifact.id as Id<"artifacts">,
            })
          }
          onSubmit={(resultData) =>
            void complete({
              userTaskId: task._id,
              subjectArtifactId: artifact.id as Id<"artifacts">,
              resultData,
            })
          }
          previousResult={previousResult}
        />
      )}
      versionLabel="Versions"
      versions={versions}
    />
  );
}

function findArtifact(detail: UserTaskViewProps["detail"], artifactId?: string) {
  if (!artifactId) return undefined;
  return Object.values(detail.artifacts)
    .flat()
    .find((artifact) => artifact.id === artifactId);
}

function MissingEditor({ label }: { label: string }) {
  return (
    <section className="border-outline rounded border bg-white p-5 text-sm text-red-700">
      {label}
    </section>
  );
}
