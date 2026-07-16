"use client";

import { ExternalLink, Monitor } from "lucide-react";
import type { ReviewFeedback } from "@factory/shared";
import type { PendingReview } from "@/data/useProjectDetail";
import { ReviewActions } from "./ReviewActions";

/** Final review: the rendered site preview — the gate a Wix builder actually judges. */
export function PreviewReview({
  onApprove,
  onRequestChanges,
  project,
  review,
}: {
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  project: { title: string; wix?: { previewUrl?: string } };
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
                The visual output is attached to this project version. A browser preview will
                appear here when Wix provisioning supplies its verified URL.
              </p>
            </div>
          </div>
        )}
      </section>

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
