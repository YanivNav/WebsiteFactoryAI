"use client";

import { RotateCcw } from "lucide-react";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ArtifactReview } from "@/components/ArtifactReview";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { useUserTask } from "@/data/useUserTask";
import { ActivityActions } from "./ActivityActions";
import { ArtifactContent } from "./ArtifactContent";
import { ArtifactReviewTask } from "./ArtifactReviewTask";
import { ArtifactSubmissionTask } from "./ArtifactSubmissionTask";

export interface UserTaskViewProps {
  detail: ProjectDetail;
  task: Doc<"userTasks">;
  readOnly: boolean;
  onReturnToCurrent: () => void;
}

export function UserTaskView(props: UserTaskViewProps) {
  if (props.readOnly) return <CompletedUserTaskView {...props} />;
  if (props.task.result.type === "selectVersion") {
    return <ArtifactReviewTask {...props} />;
  }
  return <ArtifactSubmissionTask {...props} />;
}

function CompletedUserTaskView({ detail, task, onReturnToCurrent }: UserTaskViewProps) {
  const result = findArtifact(detail, task.resultArtifactId);
  const subject = findArtifact(detail, task.chosenSubjectArtifactId ?? task.subjectArtifactId);
  const { revisit, busy } = useUserTask();
  if (!result) return <MissingArtifact />;
  const versions = detail.artifacts[result.type];

  return (
    <ArtifactReview
      approvedArtifactId={detail.approvedArtifactIds[result.type]}
      proposedArtifactId={result.id}
      renderActions={(artifact) => (
        <ActivityActions
          primary={{
            label: "Go back and revise this",
            icon: <RotateCcw size={16} />,
            loading: busy === "revisit",
            disabled: busy !== null,
            onClick: () =>
              void revisit(
                task._id,
                task.result.type === "selectVersion" ? (artifact.id as Id<"artifacts">) : undefined,
              ).then(onReturnToCurrent),
          }}
        />
      )}
      renderArtifact={(artifact) => (
        <ArtifactContent artifact={artifact} subject={subject} versions={versions} />
      )}
      versionLabel="Versions"
      versions={versions}
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
