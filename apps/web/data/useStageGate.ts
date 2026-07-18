"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type GateAction = "submit" | "regenerate";

export function useStageGate(projectId: Id<"projects">) {
  const continueFromGate = useMutation(api.projects.continueFromGate);
  const regenerateStage = useMutation(api.projects.regenerateStage);
  const [busy, setBusy] = useState<GateAction | null>(null);

  const run = useCallback(async (action: GateAction, fn: () => Promise<unknown>) => {
    setBusy(action);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }, []);

  const submit = useCallback(
    (stageData?: unknown, artifactId?: Id<"artifacts">) =>
      run("submit", () =>
        continueFromGate({
          projectId,
          ...(artifactId ? { artifactId } : {}),
          ...(stageData !== undefined ? { stageData } : {}),
        }),
      ),
    [run, continueFromGate, projectId],
  );

  const regenerate = useCallback(
    (feedback?: unknown, sourceArtifactId?: Id<"artifacts">) =>
      run("regenerate", () =>
        regenerateStage({
          projectId,
          ...(sourceArtifactId ? { sourceArtifactId } : {}),
          ...(feedback !== undefined ? { feedback } : {}),
        }),
      ),
    [run, regenerateStage, projectId],
  );

  return { submit, regenerate, busy };
}
