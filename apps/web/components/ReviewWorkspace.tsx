"use client";
/* eslint-disable @next/next/no-img-element -- Convex storage URLs are dynamic review assets. */

import { useState } from "react";
import { Check, ExternalLink, LoaderCircle, MessageSquareText, Monitor } from "lucide-react";
import type { Design, Specification } from "@factory/shared";
import { SpecificationSummary } from "./SpecificationSummary";

export function ReviewWorkspace({
  artifactType,
  assetUrls,
  comment,
  design,
  designVersions,
  onApprove,
  onCommentChange,
  onRequestChanges,
  onReviseSpecification,
  onReviseScreen,
  project,
  specification,
  specificationVersions,
  version,
}: {
  artifactType: string;
  assetUrls: Record<string, string | null>;
  comment: string;
  design?: Design;
  designVersions: Array<{ version: number; data: Design }>;
  onApprove: () => void;
  onCommentChange: (value: string) => void;
  onRequestChanges: () => void;
  onReviseSpecification: (spec: Specification) => Promise<unknown>;
  onReviseScreen: (screen: Design["screens"][number], comment: string) => Promise<unknown>;
  project: { title: string; wix?: { previewUrl?: string } };
  specification?: Specification;
  specificationVersions: Array<{ version: number; data: Specification }>;
  version: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Specification | undefined>(
    specification ? structuredClone(specification) : undefined,
  );
  const [selectedVersion, setSelectedVersion] = useState(version);
  const [saving, setSaving] = useState(false);
  const title =
    artifactType === "specification"
      ? "Site Plan Summary"
      : artifactType === "design"
        ? "Review your design"
        : "Review your site";
  const approveLabel =
    artifactType === "specification"
      ? "Approve Site Plan"
      : artifactType === "design"
        ? "Approve Design"
        : "Approve Site";
  const displayedSpecification =
    artifactType === "specification"
      ? (specificationVersions.find((item) => item.version === selectedVersion)?.data ??
        specification)
      : undefined;
  const displayedDesign =
    artifactType === "design"
      ? (designVersions.find((item) => item.version === selectedVersion)?.data ?? design)
      : undefined;
  const reviewingCurrentVersion = selectedVersion === version;
  async function saveRevision() {
    if (!draft) return;
    setSaving(true);
    try {
      await onReviseSpecification(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="border-outline rounded border bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
              Ready for review · Version {version}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-[#596170]">
              Check the work below against the client brief. Approve it to continue automatically,
              or leave one clear change request.
            </p>
          </div>
          <span className="text-primary hidden size-10 place-items-center rounded-full bg-[#edf5ff] sm:grid">
            <Check size={20} />
          </span>
        </div>
      </section>
      {specification && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#596170]">Version</span>
            {specificationVersions.map((item) => (
              <button
                className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${selectedVersion === item.version ? "border-primary text-primary bg-[#edf5ff]" : "border-outline bg-white"}`}
                key={item.version}
                onClick={() => {
                  setSelectedVersion(item.version);
                  setEditing(false);
                }}
                type="button"
              >
                v{item.version}
              </button>
            ))}
          </div>
          {selectedVersion === version && (
            <button
              className="border-outline rounded border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f1f2f4]"
              onClick={() => setEditing((value) => !value)}
              type="button"
            >
              {editing ? "Cancel editing" : "Edit site plan"}
            </button>
          )}
        </div>
      )}
      {design && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#596170]">Version</span>
          {designVersions.map((item) => (
            <button
              className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${selectedVersion === item.version ? "border-primary text-primary bg-[#edf5ff]" : "border-outline bg-white"}`}
              key={item.version}
              onClick={() => setSelectedVersion(item.version)}
              type="button"
            >
              v{item.version}
            </button>
          ))}
        </div>
      )}
      {displayedSpecification ? (
        editing && draft ? (
          <SpecificationEditor onChange={setDraft} spec={draft} />
        ) : (
          <SpecificationSummary spec={displayedSpecification} />
        )
      ) : displayedDesign ? (
        <DesignGallery
          assetUrls={assetUrls}
          canRevise={selectedVersion === version}
          design={displayedDesign}
          onReviseScreen={onReviseScreen}
        />
      ) : (
        <VisualReview
          artifactType={artifactType}
          previewUrl={project.wix?.previewUrl}
          projectTitle={project.title}
        />
      )}
      {editing && (
        <div className="flex justify-end">
          <button
            className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white disabled:opacity-40"
            disabled={saving}
            onClick={saveRevision}
            type="button"
          >
            {saving && <LoaderCircle className="animate-spin" size={14} />}Save as new version
          </button>
        </div>
      )}
      {!reviewingCurrentVersion && (
        <section className="border-outline rounded border bg-[#f1f2f4] p-4 text-sm text-[#596170]">
          This is a previous version and is available for reference only. Return to version{" "}
          {version}
          to approve it or request changes.
        </section>
      )}
      {reviewingCurrentVersion && (
        <section className="border-outline rounded border bg-[#f1f2f4] p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MessageSquareText size={18} className="text-primary" />
            Review feedback
          </div>
          <textarea
            className="border-outline focus:border-primary min-h-24 w-full resize-y rounded border bg-white p-3 text-sm outline-none placeholder:text-[#717987] focus:ring-2 focus:ring-[#d8e2ff]"
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="Describe exactly what should change…"
            value={comment}
          />
          <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row">
            <button
              className="min-h-10 rounded border border-[#727785] bg-white px-5 text-xs font-semibold tracking-[0.04em] hover:bg-[#f5f6f7] disabled:opacity-40"
              disabled={!comment.trim()}
              onClick={onRequestChanges}
              type="button"
            >
              Request changes
            </button>
            <button
              className="bg-primary inline-flex min-h-10 items-center justify-center gap-2 rounded px-6 text-xs font-semibold tracking-[0.04em] text-white hover:bg-[#064aa0]"
              onClick={onApprove}
              type="button"
            >
              <Check size={16} />
              {approveLabel}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function DesignGallery({
  assetUrls,
  canRevise,
  design,
  onReviseScreen,
}: {
  assetUrls: Record<string, string | null>;
  canRevise: boolean;
  design: Design;
  onReviseScreen: (screen: Design["screens"][number], comment: string) => Promise<unknown>;
}) {
  const [activeScreen, setActiveScreen] = useState<Design["screens"][number] | null>(null);
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  const [screenComment, setScreenComment] = useState("");
  const [submittingScreen, setSubmittingScreen] = useState(false);
  const desktopScreens = design.screens.filter((screen) => screen.viewport === "desktop");
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <span className="border-primary bg-primary rounded border px-3 py-1.5 text-[11px] font-semibold text-white">
            Desktop
          </span>
          <span className="border-outline rounded border bg-[#f1f2f4] px-3 py-1.5 text-[11px] font-semibold text-[#858c98]">
            Mobile · later
          </span>
        </div>
        <span className="text-[11px] text-[#697181]">{desktopScreens.length} screens</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {desktopScreens.map((screen) => {
          const screenshotUrl = assetUrls[screen.screenshotStorageId];
          const htmlUrl = assetUrls[screen.htmlStorageId];
          return (
            <article
              className="border-outline overflow-hidden rounded border bg-white"
              key={screen.stitchScreenId}
            >
              <button
                className="relative block aspect-[16/10] w-full overflow-hidden bg-[#e7e8e9]"
                onClick={() => setActiveScreen(screen)}
                type="button"
              >
                {screenshotUrl ? (
                  <img
                    alt={`${screen.pageTitle} desktop design`}
                    className="h-full w-full object-contain object-top transition-transform hover:scale-[1.01]"
                    src={screenshotUrl}
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-[#697181]">
                    Screenshot unavailable
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{screen.pageTitle}</h3>
                  <code className="text-[10px] text-[#858c98]">{screen.pagePath}</code>
                </div>
                <div className="flex items-center gap-1">
                  {canRevise && (
                    <button
                      className="text-primary rounded px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[#edf5ff]"
                      onClick={() => {
                        setCommentingOn(
                          commentingOn === screen.stitchScreenId ? null : screen.stitchScreenId,
                        );
                        setScreenComment("");
                      }}
                      type="button"
                    >
                      Describe a change
                    </button>
                  )}
                  {htmlUrl && (
                    <a
                      aria-label={`Open ${screen.pageTitle} HTML`}
                      className="text-primary grid size-8 place-items-center rounded hover:bg-[#edf5ff]"
                      href={htmlUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              </div>
              {commentingOn === screen.stitchScreenId && (
                <div className="border-outline border-t bg-[#f8f9fa] p-3">
                  <textarea
                    autoFocus
                    className="border-outline focus:border-primary min-h-24 w-full resize-y rounded border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#d8e2ff]"
                    onChange={(event) => setScreenComment(event.target.value)}
                    placeholder={`Describe what should change on ${screen.pageTitle}…`}
                    value={screenComment}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="rounded px-3 py-2 text-xs font-semibold hover:bg-[#e7e8e9]"
                      onClick={() => setCommentingOn(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="bg-primary inline-flex items-center gap-2 rounded px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      disabled={!screenComment.trim() || submittingScreen}
                      onClick={async () => {
                        setSubmittingScreen(true);
                        try {
                          await onReviseScreen(screen, screenComment.trim());
                        } finally {
                          setSubmittingScreen(false);
                        }
                      }}
                      type="button"
                    >
                      {submittingScreen && <LoaderCircle className="animate-spin" size={13} />}
                      Apply feedback
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {activeScreen && assetUrls[activeScreen.screenshotStorageId] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => event.target === event.currentTarget && setActiveScreen(null)}
        >
          <div className="max-h-[94vh] max-w-6xl overflow-auto rounded bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-2">
              <strong className="text-sm">{activeScreen.pageTitle} · Desktop</strong>
              <button
                className="text-primary text-xs font-semibold"
                onClick={() => setActiveScreen(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <img
              alt={`${activeScreen.pageTitle} desktop design`}
              className="h-auto w-full"
              src={assetUrls[activeScreen.screenshotStorageId]!}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SpecificationEditor({
  onChange,
  spec,
}: {
  onChange: (spec: Specification) => void;
  spec: Specification;
}) {
  const input =
    "w-full rounded border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[#d8e2ff]";
  function updatePage(index: number, patch: Partial<Specification["pages"][number]>) {
    onChange({
      ...spec,
      pages: spec.pages.map((page, pageIndex) =>
        pageIndex === index ? { ...page, ...patch } : page,
      ),
    });
  }
  return (
    <section className="border-primary space-y-4 rounded border bg-[#edf5ff] p-5">
      <div>
        <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
          Site summary
        </label>
        <textarea
          className={`${input} mt-2 min-h-24 resize-y`}
          onChange={(event) => onChange({ ...spec, summary: event.target.value })}
          value={spec.summary}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {spec.pages.map((page, pageIndex) => (
          <article
            className="border-outline space-y-3 rounded border bg-white p-4"
            key={`${page.path}-${pageIndex}`}
          >
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Page name
              </label>
              <input
                className={`${input} mt-1`}
                onChange={(event) => updatePage(pageIndex, { title: event.target.value })}
                value={page.title}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Purpose
              </label>
              <textarea
                className={`${input} mt-1 min-h-20 resize-y`}
                onChange={(event) => updatePage(pageIndex, { description: event.target.value })}
                value={page.description}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Sections
              </label>
              <div className="mt-1 space-y-2">
                {page.sections.map((section, sectionIndex) => (
                  <input
                    className={input}
                    key={`${section.type}-${sectionIndex}`}
                    onChange={(event) =>
                      updatePage(pageIndex, {
                        sections: page.sections.map((item, itemIndex) =>
                          itemIndex === sectionIndex
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                    value={section.description}
                  />
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="text-[11px] text-[#596170]">
        Saving creates a new version. Earlier versions remain available above.
      </p>
    </section>
  );
}

function VisualReview({
  artifactType,
  previewUrl,
  projectTitle,
}: {
  artifactType: string;
  previewUrl?: string;
  projectTitle: string;
}) {
  return (
    <section className="border-outline overflow-hidden rounded border bg-white">
      <div className="border-outline flex items-center justify-between border-b bg-[#f1f2f4] px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{projectTitle}</h2>
          <p className="mt-0.5 text-[11px] text-[#697181]">
            {artifactType === "design"
              ? "Visual direction and page layouts"
              : "Latest working preview"}
          </p>
        </div>
        <Monitor size={19} className="text-[#596170]" />
      </div>
      {previewUrl ? (
        <div className="p-5">
          <a
            className="border-outline text-primary flex min-h-72 items-center justify-center rounded border bg-[#edf0f3] text-sm font-semibold hover:bg-[#e3e8ef]"
            href={previewUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open visual preview <ExternalLink className="ml-2" size={16} />
          </a>
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-primary grid size-14 place-items-center rounded-full bg-[#edf5ff]">
            <Monitor size={25} />
          </div>
          <div>
            <p className="font-semibold">Review package ready</p>
            <p className="mt-1 max-w-md text-sm text-[#697181]">
              The visual output is attached to this project version. A browser preview will appear
              here when Wix provisioning supplies its verified URL.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
