"use client";

import type {Doc} from "@convex/_generated/dataModel";
import {ArtifactReview} from "@/components/ArtifactReview";
import type {ProjectDetail} from "@/data/useProjectDetail";
import {ArtifactContent} from "../activities/ArtifactContent";
import {ArtifactReviewTask} from "./ArtifactReviewTask";
import {ArtifactSubmissionTask} from "./ArtifactSubmissionTask";

export interface UserTaskViewProps {
  detail: ProjectDetail;
  task: Doc<"userTasks">;
  readOnly: boolean;
  viewedArtifactId?: string;
  onViewArtifact: (artifactId: string) => void;
}

export function UserTaskView(props: UserTaskViewProps) {
  if (props.readOnly) return <CompletedUserTaskView {...props} />;
  if (props.task.result.type === "selectVersion") {
    return <ArtifactReviewTask {...props} />;
  }
  return <ArtifactSubmissionTask {...props} />;
}

function CompletedUserTaskView({ detail, task, viewedArtifactId, onViewArtifact }: UserTaskViewProps) {
  const result = findArtifact(detail, task.resultArtifactId);
  const subject = findArtifact(detail, task.chosenSubjectArtifactId ?? task.subjectArtifactId);
  if (!result) return <MissingArtifact />;
  const versions = detail.artifacts[result.type];

  return (
    <ArtifactReview
      approvedArtifactId={detail.approvedArtifactIds[result.type]}
      onView={onViewArtifact}
      proposedArtifactId={result.id}
      renderArtifact={(artifact) => (
        <ArtifactContent artifact={artifact} subject={subject} versions={versions} />
      )}
      versionLabel="Versions"
      versions={versions}
      viewedArtifactId={viewedArtifactId}
    />
  );
}

function findArtifact(detail: ProjectDetail, artifactId?: string) {
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
