"use client";

import { useState } from "react";
import { CheckCircle2, PencilLine } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { ArtifactReview } from "@/components/ArtifactReview";
import { useUserTask } from "@/data/useUserTask";
import type { UserTaskViewProps } from "./UserTaskView";
import { ActivityActions } from "./ActivityActions";
import { ArtifactContent } from "./ArtifactContent";

export function ArtifactReviewTask({ detail, task }: UserTaskViewProps) {
  const subject = findArtifact(detail, task.subjectArtifactId);
  const { complete, revise, busy } = useUserTask();
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");

  if (!subject) return <MissingArtifact />;
  const versions = detail.artifacts[subject.type] ?? [];

  return (
    <ArtifactReview
      approvedArtifactId={detail.approvedArtifactIds[subject.type]}
      proposedArtifactId={subject.id}
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
              label: `Continue with Version ${artifact.version}`,
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
          />
        </>
      )}
      renderArtifact={(artifact) => <ArtifactContent artifact={artifact} versions={versions} />}
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
