"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Sparkles } from "lucide-react";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { ConfirmAction } from "./ConfirmAction";

/**
 * Ask for a change to a built/published site in plain language. Re-enters the
 * build stage; the change is reviewed before it goes live. Shown wherever the
 * site is presented as done (the live-site step and the resting project).
 */
export function SiteChangeRequest({ detail }: { detail: ProjectDetail }) {
  const requestSiteChange = useMutation(api.projects.requestSiteChange);
  const rebuildSiteClean = useMutation(api.projects.rebuildSiteClean);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const projectId = detail.project._id as Id<"projects">;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setFeedback("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-outline rounded border bg-white p-5">
      <label className="text-ink flex items-center gap-2 text-sm font-medium">
        <Sparkles size={16} className="text-primary" /> Want to change something?
      </label>
      <p className="text-ink-muted mt-1 text-xs">
        Describe the change, a bug to fix, or a feature to add — in plain language. The site is
        rebuilt and you review it before it goes live.
      </p>
      <textarea
        className="border-outline bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary mt-2 block w-full rounded border px-3 py-2 text-sm outline-none focus:ring-1"
        rows={3}
        placeholder="e.g. The syllabus form doesn't send — please fix it. Also add a testimonials section to the home page."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <ConfirmAction
          label="Rebuild code from scratch"
          message="Replaces the current generated code (kept in git history). Content, Wix site, and design stay."
          confirmLabel="Rebuild"
          className="text-ink-muted hover:text-ink text-xs underline disabled:opacity-50"
          disabled={busy}
          onConfirm={() => void run(() => rebuildSiteClean({ projectId }))}
        />
        <button
          type="button"
          className="bg-primary rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          disabled={busy || !feedback.trim()}
          onClick={() => void run(() => requestSiteChange({ projectId, feedback: feedback.trim() }))}
        >
          {busy ? "Starting…" : "Request change"}
        </button>
      </div>
    </section>
  );
}
