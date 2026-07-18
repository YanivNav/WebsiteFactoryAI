"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { ProjectDetail } from "@/data/useProjectDetail";

export function DraftActivity({ detail }: { detail: ProjectDetail }) {
  const start = useMutation(api.projects.start);
  const briefArtifact = detail.artifacts.brief.find(
    (artifact) => artifact.id === detail.approvedArtifactIds.brief,
  );
  const [brief, setBrief] = useState(briefArtifact?.data ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!brief.trim()) return;
    setBusy(true);
    try {
      await start({ projectId: detail.project._id, brief: brief.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-outline rounded border bg-white p-5">
      <h2 className="text-ink text-lg font-semibold">Project brief</h2>
      <p className="text-ink-muted mt-1 text-sm">
        Update the brief before starting the planning process again.
      </p>
      <textarea
        className="border-outline bg-canvas text-ink focus:border-primary focus:ring-primary mt-4 block min-h-48 w-full rounded border px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1"
        onChange={(event) => setBrief(event.target.value)}
        value={brief}
      />
      <div className="border-outline mt-5 flex justify-end border-t pt-4">
        <button
          className="bg-primary rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !brief.trim()}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? "Starting…" : "Start planning"}
        </button>
      </div>
    </section>
  );
}
