import type { Doc } from "@convex/_generated/dataModel";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { WorkProgress } from "../progress/WorkProgress";
import { DraftActivity } from "./DraftActivity";
import { UserTaskView } from "../tasks/UserTaskView";

export function ActivityView({
  detail,
  viewedTask,
  viewedArtifactId,
  onViewArtifact,
}: {
  detail: ProjectDetail;
  viewedTask?: Doc<"userTasks">;
  viewedArtifactId?: string;
  onViewArtifact: (artifactId: string) => void;
}) {
  const task = viewedTask ?? detail.currentUserTask;
  if (task) {
    return (
      <UserTaskView
        detail={detail}
        readOnly={task._id !== detail.currentUserTask?._id || task.status !== "open"}
        task={task}
        viewedArtifactId={viewedArtifactId}
        onViewArtifact={onViewArtifact}
      />
    );
  }
  if (detail.currentWork) return <WorkProgress detail={detail} />;
  if (detail.project.currentActivity.type === "draft") return <DraftActivity detail={detail} />;
  return <EmptyActivityView />;
}

export function EmptyActivityView() {
  return <div className="m-8 text-2xl">Coming Soon</div>;
}
