import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { ExternalLink, PartyPopper, Sparkles } from "lucide-react";
import { ConfirmAction } from "../ConfirmAction";

/**
 * A published (resting) project: the live site plus a plain-language change box.
 * Requesting a change re-enters the build stage — the same refine loop, reused
 * post-publish.
 */
export function CompletedActivity({ detail }: { detail: ProjectDetail }) {
  const release = detail.artifacts.siteRelease[0];
  const requestSiteChange = useMutation(api.projects.requestSiteChange);
  const rebuildSiteClean = useMutation(api.projects.rebuildSiteClean);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const note = feedback.trim();
    if (!note) return;
    setBusy(true);
    try {
      await requestSiteChange({ projectId: detail.project._id as Id<"projects">, feedback: note });
      setFeedback("");
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    try {
      await rebuildSiteClean({ projectId: detail.project._id as Id<"projects"> });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-5">
        <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
          <PartyPopper size={16} className="text-primary" /> Your site is live
        </h3>
        {release?.data.liveUrl && (
          <a
            className="text-primary mt-3 flex w-fit items-center gap-1 text-sm underline hover:no-underline"
            href={release.data.liveUrl}
            rel="noreferrer"
            target="_blank"
          >
            {release.data.liveUrl} <ExternalLink size={13} />
          </a>
        )}
      </section>

      <section className="border-outline rounded border bg-white p-5">
        <label className="text-ink flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} className="text-primary" /> Want to change something?
        </label>
        <p className="text-ink-muted mt-1 text-xs">
          Describe the change in plain language — the site is rebuilt and you review it again
          before it goes live.
        </p>
        <textarea
          className="border-outline bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary mt-2 block w-full rounded border px-3 py-2 text-sm outline-none focus:ring-1"
          rows={3}
          placeholder="e.g. Make the hero headline bolder and add a contact section to the home page"
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
            onConfirm={() => void rebuild()}
          />
          <button
            type="button"
            className="bg-primary rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={busy || !feedback.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Starting…" : "Request change"}
          </button>
        </div>
      </section>
    </div>
  );
}
