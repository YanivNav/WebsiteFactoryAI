"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { WebsiteContent } from "@factory/shared";

type TaskAction = "complete" | "revise" | "revisit" | "delete" | "applyContent";

/** One editable content slot — derived from the shared schema so it can't drift. */
export type ContentItemInput = WebsiteContent["items"][number];

export function useUserTask() {
  const completeMutation = useMutation(api.projects.completeUserTask);
  const reviseMutation = useMutation(api.projects.reviseCurrentTask);
  const revisitMutation = useMutation(api.projects.revisitUserTask);
  const deleteMutation = useMutation(api.projects.deleteArtifact);
  const applyContentMutation = useMutation(api.projects.applyContent);
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

  const applyContent = useCallback(
    (input: {
      userTaskId: Id<"userTasks">;
      sourceArtifactId: Id<"artifacts">;
      items: ContentItemInput[];
    }) => execute("applyContent", () => applyContentMutation(input)),
    [applyContentMutation, execute],
  );

  return { complete, revise, revisit, deleteVersion, applyContent, busy };
}
