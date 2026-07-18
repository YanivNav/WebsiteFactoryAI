"use client";

import { use, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { useProjectDetail } from "@/data/useProjectDetail";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const result = useProjectDetail(projectId);
  const [viewedTaskId, setViewedTaskId] = useState<Id<"userTasks">>();

  if (result.status === "loading") {
    return (
      <CenteredState>
        <LoaderCircle className="animate-spin" /> Loading project…
      </CenteredState>
    );
  }
  if (result.status === "not-found") {
    return (
      <CenteredState>
        <CircleAlert /> Project not found.
      </CenteredState>
    );
  }

  const { detail } = result;
  const viewedTask = viewedTaskId
    ? detail.userTasks.find((task) => task._id === viewedTaskId)
    : undefined;
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <ProjectHeader activityLabel={detail.activityLabel} projectTitle={detail.project.title} />
      <div className="flex min-h-[calc(100vh-56px)]">
        <LifecycleTimeline
          detail={detail}
          onReset={() => setViewedTaskId(undefined)}
          onViewTask={setViewedTaskId}
          viewedTaskId={viewedTaskId}
        />
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            <ProjectWorkspace
              detail={detail}
              onReturnToCurrent={() => setViewedTaskId(undefined)}
              viewedTask={viewedTask}
            />
          </div>
        </main>
      </div>
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
