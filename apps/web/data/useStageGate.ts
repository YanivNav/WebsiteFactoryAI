"use client";

import {useCallback, useState} from "react";
import {useMutation} from "convex/react";
import {api} from "@convex/_generated/api";
import type {Id} from "@convex/_generated/dataModel";

export type GateAction = "submit" | "regenerate";

export function useStageGate(projectId: Id<"projects">) {
  const continueFromGate = useMutation(api.projects.continueFromGate);
  const regenerateStage = useMutation(api.projects.regenerateStage);
  const [busy, setBusy] = useState<GateAction | null>(null);

  const run = useCallback(
    async (action: GateAction, fn: () => Promise<unknown>) => {
      setBusy(action);
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const submit = useCallback(
    (stageData?: unknown) => run("submit", () => continueFromGate({projectId, stageData})),
    [run, continueFromGate, projectId],
  );

  const regenerate = useCallback(
    (feedback?: unknown) => run("regenerate", () => regenerateStage({projectId, feedback})),
    [run, regenerateStage, projectId],
  );

  return {submit, regenerate, busy};
}
