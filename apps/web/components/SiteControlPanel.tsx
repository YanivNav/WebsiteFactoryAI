"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ContentItemInput } from "@/data/useUserTask";
import { ArrowLeft, ExternalLink, LayoutDashboard, MonitorPlay, PenLine, Plus, Rocket, Sparkles, Wrench } from "lucide-react";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { WebsiteContentForm } from "./artifacts/WebsiteContentArtifact";
import { ManualTasksList } from "./artifacts/ManualTasksArtifact";

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
  const devUrl = wix?.devUrl;
  const dashboardUrl = wix?.dashboardUrl ?? (siteId ? `https://manage.wix.com/dashboard/${siteId}/home` : undefined);

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
        devUrl={devUrl}
        dashboardUrl={dashboardUrl}
        siteId={siteId}
        isLive={isLive}
        projectId={projectId}
        builtAt={build?.builtAt}
      />

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
  devUrl,
  dashboardUrl,
  siteId,
  isLive,
  projectId,
  builtAt,
}: {
  liveUrl?: string;
  previewUrl?: string;
  devUrl?: string;
  dashboardUrl?: string;
  siteId?: string;
  isLive: boolean;
  projectId: Id<"projects">;
  builtAt?: number;
}) {
  const publishSite = useMutation(api.projects.publishSite);
  const startDevServer = useMutation(api.projects.startDevServer);
  const startPreview = useMutation(api.projects.startPreview);
  const returnToBuildMode = useMutation(api.projects.returnToBuildMode);
  const [publishing, setPublishing] = useState(false);
  const [startingDev, setStartingDev] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const devLoading = devUrl === "pending";

  // Best URL to show: live > preview > nothing.
  const displayUrl = liveUrl ?? previewUrl;
  const displayLabel = isLive ? "Live" : displayUrl ? "Preview" : null;

  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-ink truncate text-lg font-semibold tracking-[-0.01em]">
              {displayUrl ? (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary hover:underline"
                >
                  {siteHostname(displayUrl)}
                </a>
              ) : siteId ? (
                <span className="text-ink-muted">Site built — not yet published</span>
              ) : (
                "Your site"
              )}
            </h2>
            {displayUrl && (
              <a
                href={displayUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-muted hover:text-ink"
                title={`Open ${displayLabel} site`}
              >
                <ExternalLink size={14} />
              </a>
            )}
            {dashboardUrl && (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-muted hover:text-ink"
                title="Open Wix dashboard"
              >
                <LayoutDashboard size={14} />
              </a>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge isLive={isLive} />
            {displayLabel && (
              <span className="text-ink-muted text-[10px]">({displayLabel})</span>
            )}
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
          {/* Dev */}
          {devLoading ? (
            <span className="border-outline text-ink-muted inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium">
              <Wrench size={14} className="animate-spin" /> Starting dev...
            </span>
          ) : devUrl && devUrl !== "pending" ? (
            <a
              href={devUrl}
              target="_blank"
              rel="noreferrer"
              className="border-outline text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Wrench size={14} /> Dev
            </a>
          ) : (
            <button
              type="button"
              disabled={startingDev}
              onClick={() => {
                setStartingDev(true);
                void startDevServer({ projectId }).finally(() => setStartingDev(false));
              }}
              className="border-outline text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Wrench size={14} /> {startingDev ? "Starting..." : "Dev"}
            </button>
          )}
          {/* Preview — always a build+preview action button */}
          <button
            type="button"
            disabled={generatingPreview}
            onClick={() => {
              setGeneratingPreview(true);
              void startPreview({ projectId }).finally(() => setGeneratingPreview(false));
            }}
            className="border-outline text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            title="Build the site and generate a fresh preview URL"
          >
            <MonitorPlay size={14} /> {generatingPreview ? "Building..." : "Preview"}
          </button>
          {/* Publish */}
          <button
            type="button"
            disabled={publishing}
            onClick={() => {
              setPublishing(true);
              void publishSite({ projectId }).finally(() => setPublishing(false));
            }}
            className="bg-primary inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Rocket size={14} /> {publishing ? "Publishing..." : isLive ? "Republish" : "Publish"}
          </button>
        </div>
      </div>
    </section>
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
  const applyContent = useMutation(api.projects.applyContentReady);
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
  const requestSiteChange = useMutation(api.projects.requestSiteChange);
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
  const requestScreenChange = useMutation(api.projects.requestScreenChange);
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
