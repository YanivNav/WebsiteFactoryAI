import type { Doc } from "@convex/_generated/dataModel";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { WorkProgress } from "./WorkProgress";
import { DraftActivity } from "./DraftActivity";
import { UserTaskView } from "./UserTaskView";

export function ActivityView({
  detail,
  viewedTask,
  onReturnToCurrent,
}: {
  detail: ProjectDetail;
  viewedTask?: Doc<"userTasks">;
  onReturnToCurrent: () => void;
}) {
  const task = viewedTask ?? detail.currentUserTask;
  if (task) {
    return (
      <UserTaskView
        detail={detail}
        onReturnToCurrent={onReturnToCurrent}
        readOnly={task._id !== detail.currentUserTask?._id || task.status !== "open"}
        task={task}
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
