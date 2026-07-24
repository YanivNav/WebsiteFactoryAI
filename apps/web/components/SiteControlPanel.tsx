"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { wixDashboardUrl } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { ContentItemInput } from "@/data/useUserTask";
import { ArrowLeft, ExternalLink, GitCommit, LayoutDashboard, MonitorPlay, PenLine, Plus, Rocket, Sparkles, Square, Wrench } from "lucide-react";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { WebsiteContentForm } from "./artifacts/WebsiteContentArtifact";
import { ManualTasksList } from "./artifacts/ManualTasksArtifact";
import { DevConsole } from "./DevConsole";

/**
 * The post-build control panel: dev, preview, publish, content editing, change
 * requests, screen management. Shown when the project is "ready" or "completed".
 */
export function SiteControlPanel({ detail }: { detail: ProjectDetail }) {
  const projectId = detail.project._id as Id<"projects">;
  const latestBuild = detail.artifacts.siteBuild[0];
  const build = latestBuild?.data;
  const wix = detail.project.wix;
  const isLive = detail.activityStatus === "completed";
  // siteId could be on project.wix, or buried in the WixProject artifact.
  const siteId = wix?.siteId ?? (detail.artifacts.wixProject[0]?.data as any)?.wix?.siteId as string | undefined;
  const liveUrl = wix?.liveUrl;
  const previewUrl = wix?.previewUrl ?? build?.previewUrl;
  const devSession = detail.devSession;
  // Derived from the real metasite id — a reliable, site-scoped dashboard link.
  // Falls back to composing from siteId if the stored value predates this.
  const dashboardUrl = wix?.dashboardUrl ?? wixDashboardUrl(siteId);

  const content = detail.artifacts.websiteContent.find(
    (a) => a.id === build?.contentArtifactId,
  );
  const manual = detail.artifacts.manualTasks.find(
    (a) => a.id === build?.manualTasksArtifactId,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header: URL + actions */}
      <SiteHeader
        liveUrl={liveUrl}
        previewUrl={previewUrl}
        devSession={devSession}
        dashboardUrl={dashboardUrl}
        siteId={siteId}
        isLive={isLive}
        projectId={projectId}
        builtAt={build?.builtAt}
      />

      {/* Dev server console — live Astro logs (present once dev has been started) */}
      <DevConsole projectId={projectId} session={devSession} />

      {/* Git history */}
      <GitHistoryCard projectId={projectId} repoRevision={build?.repoRevision} commits={build?.commits} />

      {/* Screens */}
      <ScreensCard detail={detail} projectId={projectId} />

      {/* Content */}
      {content && (
        <ContentCard content={content} projectId={projectId} />
      )}

      {/* Continuous Improvement */}
      <ChangeRequestCard projectId={projectId} />

      {/* Manual Tasks */}
      {manual && <ManualTasksList items={manual.data.items} />}
    </div>
  );
}

/** Top bar: site URL, status badge, dev/preview/publish buttons. */
function SiteHeader({
  liveUrl,
  previewUrl,
  devSession,
  dashboardUrl,
  siteId,
  isLive,
  projectId,
  builtAt,
}: {
  liveUrl?: string;
  previewUrl?: string;
  devSession?: Doc<"devSessions">;
  dashboardUrl?: string;
  siteId?: string;
  isLive: boolean;
  projectId: Id<"projects">;
  builtAt?: number;
}) {
  const publishSite = useMutation(api.siteManagement.publishSite);
  const startPreview = useMutation(api.siteManagement.startPreview);
  const returnToBuildMode = useMutation(api.siteManagement.returnToBuildMode);
  const [publishing, setPublishing] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-ink truncate text-lg font-semibold tracking-[-0.01em]">
              {liveUrl ? (
                <>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary hover:underline"
                  >
                    {siteHostname(liveUrl)}
                  </a>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-muted hover:text-ink ml-1 inline-block align-middle"
                    title="Open live site"
                  >
                    <ExternalLink size={14} />
                  </a>
                </>
              ) : siteId ? (
                <span className="text-ink-muted">Site built — not yet published</span>
              ) : (
                "Your site"
              )}
            </h2>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge isLive={!!liveUrl} />
            {builtAt && (
              <span className="text-ink-muted text-xs">
                Last updated {formatDate(builtAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void returnToBuildMode({ projectId })}
            className="text-ink-muted hover:text-ink flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeft size={12} /> Build mode
          </button>
          {/* Wix dashboard — a real, site-scoped link (derived from the site id). */}
          {dashboardUrl && (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="border-outline text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors"
              title="Open this site's Wix dashboard"
            >
              <LayoutDashboard size={14} /> Dashboard
            </a>
          )}
          {/* Dev server — long-lived; opens automatically and streams logs below. */}
          <DevButton projectId={projectId} session={devSession} />
          {/* Preview — generates a fresh test deploy. If a preview URL exists, show it. */}
          <div className="inline-flex items-center rounded border border-outline overflow-hidden">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-medium transition-colors"
                title="Open preview site"
              >
                <MonitorPlay size={14} /> Preview
              </a>
            ) : (
              <button
                type="button"
                disabled={generatingPreview}
                onClick={() => {
                  setGeneratingPreview(true);
                  void startPreview({ projectId }).finally(() => setGeneratingPreview(false));
                }}
                className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <MonitorPlay size={14} /> {generatingPreview ? "Building..." : "Preview"}
              </button>
            )}
            <button
              type="button"
              disabled={generatingPreview}
              onClick={() => {
                setGeneratingPreview(true);
                void startPreview({ projectId }).finally(() => setGeneratingPreview(false));
              }}
              className="text-ink-muted hover:text-ink border-l border-outline bg-white px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              title="Build a fresh preview"
            >
              {generatingPreview ? "⏳" : "↻"}
            </button>
          </div>
          {/* Publish — builds and deploys to the live domain. */}
          <button
            type="button"
            disabled={publishing}
            onClick={() => {
              setPublishing(true);
              void publishSite({ projectId }).finally(() => setPublishing(false));
            }}
            className="bg-primary inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Rocket size={14} /> {publishing ? "Publishing..." : liveUrl ? "Republish" : "Publish"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The dev-server control: start it, open its live link, and stop it. */
function DevButton({ projectId, session }: { projectId: Id<"projects">; session?: Doc<"devSessions"> }) {
  const startDevServer = useMutation(api.siteManagement.startDevServer);
  const stopDevServer = useMutation(api.siteManagement.stopDevServer);
  const [busy, setBusy] = useState(false);
  const openedRef = useRef<string | null>(null);

  const status = session?.status;
  const url = session?.url;

  // Auto-open the dev site in a new tab the moment it starts serving.
  useEffect(() => {
    if (status === "running" && url && openedRef.current !== url) {
      openedRef.current = url;
      window.open(url, "_blank", "noopener");
    }
    if (status !== "running") openedRef.current = null;
  }, [status, url]);

  if (status === "running" && url) {
    return (
      <span className="border-outline inline-flex items-center overflow-hidden rounded border">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open the dev site"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-medium"
        >
          <Wrench size={14} className="text-[#22a75a]" /> Dev
        </a>
        <button
          type="button"
          title="Stop the dev server"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void stopDevServer({ projectId }).finally(() => setBusy(false));
          }}
          className="text-ink-muted hover:text-ink border-outline border-l bg-white px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <Square size={12} />
        </button>
      </span>
    );
  }

  if (status === "starting" || busy) {
    return (
      <span className="border-outline text-ink-muted inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium">
        <Wrench size={14} className="animate-spin" /> Starting…
      </span>
    );
  }

  const failed = status === "error";
  return (
    <button
      type="button"
      title={failed ? session?.exitReason ?? "The dev server stopped unexpectedly" : "Start the dev server"}
      onClick={() => {
        setBusy(true);
        void startDevServer({ projectId }).finally(() => setBusy(false));
      }}
      className={`inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        failed
          ? "border-[#f2c2bf] text-[#a82922] hover:opacity-80"
          : "border-outline text-ink-muted hover:text-ink"
      }`}
    >
      <Wrench size={14} /> {failed ? "Dev failed — retry" : "Dev"}
    </button>
  );
}

function StatusBadge({ isLive }: { isLive: boolean }) {
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[#b6dfc6] bg-[#effaf3] px-2 py-0.5 text-[10px] font-bold text-[#17693a]">
        <i className="size-1.5 rounded-full bg-[#22a75a] animate-pulse" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#b9d5fb] bg-[#edf5ff] px-2 py-0.5 text-[10px] font-bold text-[#12409e]">
      <i className="size-1.5 rounded-full bg-[#3b82f6]" />
      Ready
    </span>
  );
}

/** Owner content form (hero text, images, logo). */
function ContentCard({
  content,
  projectId,
}: {
  content: { id: string; data: { items: ContentItemInput[] } };
  projectId: Id<"projects">;
}) {
  const applyContent = useMutation(api.siteManagement.applyContentReady);
  const [busy, setBusy] = useState(false);

  return (
    <section className="border-outline rounded border bg-white p-4">
      <WebsiteContentForm
        key={content.id}
        items={content.data.items}
        busy={busy}
        onApply={(items: ContentItemInput[]) => {
          setBusy(true);
          void applyContent({ projectId, items }).finally(() => setBusy(false));
        }}
      />
    </section>
  );
}

/** Plain-language change request: same pattern as the old SiteChangeRequest. */
function ChangeRequestCard({ projectId }: { projectId: Id<"projects"> }) {
  const requestSiteChange = useMutation(api.siteManagement.requestSiteChange);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!feedback.trim()) return;
    setBusy(true);
    try {
      await requestSiteChange({ projectId, feedback: feedback.trim() });
      setFeedback("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-center justify-between">
        <label className="text-ink flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} className="text-primary" /> Continuous Improvement
        </label>
      </div>
      <p className="text-ink-muted mt-1 text-xs">
        Describe a change, a bug to fix, or a feature to add — in plain language.
      </p>
      <textarea
        className="border-outline bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary mt-2 block w-full rounded border px-3 py-2 text-sm outline-none focus:ring-1"
        rows={3}
        placeholder="e.g. Add a testimonials section to the home page, or fix the contact form submission."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="bg-primary rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          disabled={busy || !feedback.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Requesting..." : "Request Change"}
        </button>
      </div>
    </section>
  );
}

function GitHistoryCard({
  projectId,
  repoRevision,
  commits,
}: {
  projectId: Id<"projects">;
  repoRevision?: string;
  commits?: Array<{ sha: string; message: string; date: string }>;
}) {
  const revertToCommit = useMutation(api.siteManagement.revertToCommit);
  const [reverting, setReverting] = useState<string | null>(null);

  if (!commits || commits.length === 0) {
    return (
      <section className="border-outline rounded border bg-white p-4">
        <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
          <GitCommit size={14} /> Git History
        </h3>
        {repoRevision ? (
          <p className="text-ink-muted mt-1 font-mono text-xs">{repoRevision.slice(0, 7)} (current)</p>
        ) : (
          <p className="text-ink-muted mt-1 text-xs">Loading...</p>
        )}
      </section>
    );
  }

  return (
    <section className="border-outline rounded border bg-white p-4">
      <h3 className="text-ink mb-2 flex items-center gap-2 text-sm font-semibold">
        <GitCommit size={14} /> Git History ({commits.length} commits)
      </h3>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {commits.map((commit) => {
          const isCurrent = commit.sha === repoRevision;
          const date = commit.date ? new Date(commit.date) : null;
          return (
            <div
              key={commit.sha}
              className={`text-xs flex items-center justify-between gap-2 rounded px-2 py-1 ${
                isCurrent ? "bg-[#edf5ff]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="text-ink">{commit.message.slice(0, 80)}</span>
                {date && (
                  <span className="text-ink-muted ml-1">
                    &mdash; {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {date.getFullYear() !== new Date().getFullYear()
                      ? `, ${date.getFullYear()}`
                      : ""}
                  </span>
                )}
                {isCurrent && (
                  <span className="text-primary ml-1 text-[10px] font-medium">(current)</span>
                )}
              </div>
              {!isCurrent && (
                <button
                  type="button"
                  disabled={reverting === commit.sha}
                  className="text-primary shrink-0 text-[10px] hover:underline disabled:opacity-50"
                  onClick={() => {
                    setReverting(commit.sha);
                    void revertToCommit({ projectId, commit: commit.sha });
                  }}
                >
                  {reverting === commit.sha ? "..." : "restore"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - ms;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function siteHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Current site screens from the design artifact, with redesign and add-screen actions. */
function ScreensCard({
  detail,
  projectId,
}: {
  detail: ProjectDetail;
  projectId: Id<"projects">;
}) {
  const requestScreenChange = useMutation(api.siteManagement.requestScreenChange);
  const design = detail.artifacts.design[0];
  const screens = design?.data?.screens ?? [];

  // Resolve screen image URLs from the design's assets
  const assetById = new Map((design?.assets ?? []).map((a) => [a.id, a]));

  return (
    <section className="border-outline rounded border bg-white p-5">
      <h3 className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
        <PenLine size={16} className="text-primary" /> Screens
      </h3>
      <div className="flex flex-wrap gap-3">
        {screens.map((screen: { name: string; path: string; imageAssetId?: string }) => (
          <ScreenCard
            key={screen.path}
            screen={screen}
            imageUrl={screen.imageAssetId ? (assetById.get(screen.imageAssetId)?.url ?? null) : null}
            projectId={projectId}
            requestScreenChange={requestScreenChange}
          />
        ))}
        <AddScreenCard projectId={projectId} requestScreenChange={requestScreenChange} />
      </div>
    </section>
  );
}

function ScreenCard({
  screen,
  imageUrl,
  projectId,
  requestScreenChange,
}: {
  screen: { name: string; path: string; imageAssetId?: string };
  imageUrl: string | null;
  projectId: Id<"projects">;
  requestScreenChange: ReturnType<typeof useMutation>;
}) {
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="border-outline w-44 overflow-hidden rounded border bg-white">
      <div className="bg-canvas h-24 overflow-hidden border-b">
        {imageUrl ? (
          <img src={imageUrl} alt={screen.name} className="h-full w-full object-cover" />
        ) : (
          <div className="text-ink-muted flex h-full items-center justify-center text-xs">
            {screen.path}
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-ink truncate text-xs font-medium">{screen.name}</p>
        <p className="text-ink-muted truncate text-[10px]">{screen.path}</p>
        {editing ? (
          <div className="mt-2 space-y-1">
            <textarea
              className="bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary w-full rounded border px-2 py-1 text-[10px] outline-none focus:ring-1"
              rows={2}
              placeholder="What should change?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex gap-1">
              <button
                type="button"
                disabled={!feedback.trim()}
                className="bg-primary flex-1 rounded px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                onClick={() => {
                  void requestScreenChange({ projectId, screenPath: screen.path, feedback: feedback.trim() });
                  setFeedback("");
                  setEditing(false);
                }}
              >
                Send
              </button>
              <button
                type="button"
                className="text-ink-muted hover:text-ink rounded px-2 py-1 text-[10px]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-ink-muted hover:text-primary mt-1 text-[10px] hover:underline"
            onClick={() => setEditing(true)}
          >
            Redesign
          </button>
        )}
      </div>
    </div>
  );
}

function AddScreenCard({
  projectId,
  requestScreenChange,
}: {
  projectId: Id<"projects">;
  requestScreenChange: ReturnType<typeof useMutation>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="border-outline w-44 overflow-hidden rounded border border-dashed bg-white">
      <div className="p-3">
        {adding ? (
          <div className="space-y-2">
            <input
              className="bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary w-full rounded border px-2 py-1 text-[10px] outline-none focus:ring-1"
              placeholder="Screen name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              className="bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary w-full rounded border px-2 py-1 text-[10px] outline-none focus:ring-1"
              rows={2}
              placeholder="Description for the designer..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-1">
              <button
                type="button"
                disabled={!name.trim() || !description.trim()}
                className="bg-primary flex-1 rounded px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                onClick={() => {
                  const path = "/" + name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                  const prompt = `Screen name: ${name.trim()}\n\nDescription: ${description.trim()}`;
                  void requestScreenChange({ projectId, screenPath: path, feedback: prompt });
                  setName("");
                  setDescription("");
                  setAdding(false);
                }}
              >
                Create
              </button>
              <button
                type="button"
                className="text-ink-muted hover:text-ink rounded px-2 py-1 text-[10px]"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-ink-muted hover:text-primary flex w-full flex-col items-center gap-1 py-4"
            onClick={() => setAdding(true)}
          >
            <Plus size={20} />
            <span className="text-[10px]">Add screen</span>
          </button>
        )}
      </div>
    </div>
  );
}
