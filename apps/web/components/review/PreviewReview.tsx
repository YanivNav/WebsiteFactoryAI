"use client";

import { Check, CircleAlert, ExternalLink, Monitor, Wrench } from "lucide-react";
import type { QaReport, ReviewFeedback } from "@factory/shared";
import type { PendingReview } from "@/data/useProjectDetail";
import { ReviewActions } from "./ReviewActions";

/** Final review: the rendered site preview — the gate a Wix builder actually judges. */
export function PreviewReview({
  assetUrls,
  onApprove,
  onRequestChanges,
  project,
  qaReport,
  review,
}: {
  assetUrls: Record<string, string | null>;
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  project: { title: string; wix?: { previewUrl?: string } };
  qaReport?: QaReport;
  review: PendingReview;
}) {
  const previewUrl = project.wix?.previewUrl;
  return (
    <div className="space-y-5">
      <section className="border-outline overflow-hidden rounded border bg-white">
        <div className="border-outline flex items-center justify-between border-b bg-[#f1f2f4] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{project.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#697181]">Latest working preview</p>
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

      {qaReport && <QaEvidence assetUrls={assetUrls} report={qaReport} />}

      <ReviewActions
        approveLabel="Approve Site"
        currentVersion={review.version}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        reviewingCurrentVersion
      />
    </div>
  );
}

function QaEvidence({
  assetUrls,
  report,
}: {
  assetUrls: Record<string, string | null>;
  report: QaReport;
}) {
  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-[10px] font-bold tracking-[0.1em] uppercase">
            Website checks
          </p>
          <h2 className="mt-1 text-base font-semibold">
            {report.status === "repaired"
              ? "Tested and repaired automatically"
              : "All checks passed"}
          </h2>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded bg-[#e4f5e9] px-2.5 py-1 text-[#17693a]">
            {report.summary.passed} passed
          </span>
          {report.summary.repaired > 0 && (
            <span className="rounded bg-[#fff2d8] px-2.5 py-1 text-[#7a5310]">
              {report.summary.repaired} repaired
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 divide-y divide-[#e1e3e6] border-y border-[#e1e3e6]">
        {report.checks.map((check) => {
          const screenshotUrl = check.screenshotStorageId
            ? assetUrls[check.screenshotStorageId]
            : null;
          const Icon =
            check.status === "passed" ? Check : check.status === "repaired" ? Wrench : CircleAlert;
          return (
            <div className="flex items-start gap-3 py-3" key={check.id}>
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                  check.status === "passed"
                    ? "bg-[#e4f5e9] text-[#17693a]"
                    : check.status === "repaired"
                      ? "bg-[#fff2d8] text-[#7a5310]"
                      : "bg-[#fff3f2] text-[#a82922]"
                }`}
              >
                <Icon size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{check.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#697181]">{check.path}</p>
                  </div>
                  {screenshotUrl && (
                    <a
                      className="text-primary text-xs font-semibold hover:underline"
                      href={screenshotUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View evidence
                    </a>
                  )}
                </div>
                {check.status === "repaired" && (
                  <p className="mt-1 text-xs text-[#7a5310]">
                    Fixed and verified on a new preview.
                  </p>
                )}
                {check.failures.length > 0 && (
                  <p className="mt-1 text-xs text-[#a82922]">{check.failures.join(" · ")}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
