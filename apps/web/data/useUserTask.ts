"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type TaskAction = "complete" | "revise" | "revisit" | "delete";

export function useUserTask() {
  const completeMutation = useMutation(api.projects.completeUserTask);
  const reviseMutation = useMutation(api.projects.reviseCurrentTask);
  const revisitMutation = useMutation(api.projects.revisitUserTask);
  const deleteMutation = useMutation(api.projects.deleteArtifact);
  const [busy, setBusy] = useState<TaskAction | null>(null);

  const execute = useCallback(async (action: TaskAction, callback: () => Promise<unknown>) => {
    setBusy(action);
    try {
      return await callback();
    } finally {
      setBusy(null);
    }
  }, []);

  const complete = useCallback(
    (input: {
      userTaskId: Id<"userTasks">;
      artifactId?: Id<"artifacts">;
      subjectArtifactId?: Id<"artifacts">;
      resultData?: unknown;
    }) => execute("complete", () => completeMutation(input)),
    [completeMutation, execute],
  );

  const revise = useCallback(
    (input: {
      userTaskId: Id<"userTasks">;
      sourceArtifactId: Id<"artifacts">;
      feedback?: string;
      screenPath?: string;
    }) => execute("revise", () => reviseMutation(input)),
    [execute, reviseMutation],
  );

  const revisit = useCallback(
    (userTaskId: Id<"userTasks">, artifactId?: Id<"artifacts">) =>
      execute("revisit", () => revisitMutation({ userTaskId, artifactId })),
    [execute, revisitMutation],
  );

  const deleteVersion = useCallback(
    (input: { artifactId: Id<"artifacts"> }) =>
      execute("delete", () => deleteMutation(input)),
    [deleteMutation, execute],
  );

  return { complete, revise, revisit, deleteVersion, busy };
}
