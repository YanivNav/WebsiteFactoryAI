"use client";

import { Check } from "lucide-react";
import type { ReviewFeedback, Specification } from "@factory/shared";
import type { ArtifactVersion, PendingReview } from "@/data/useProjectDetail";
import type { Design } from "@factory/shared";
import { DesignReview } from "./DesignReview";
import { PreviewReview } from "./PreviewReview";
import { SpecificationReview } from "./SpecificationReview";

const REVIEW_TITLES: Record<PendingReview["artifactType"], string> = {
  specification: "Site Plan Summary",
  design: "Review your design",
  preview: "Review your site",
};

/**
 * A review gate. This is ONLY a wrapper: the shared header, then the view for the
 * artifact type under review. Each view is self-contained (its own versions, body,
 * and actions) — to support a new reviewable artifact, add a view and a case here.
 */
export function ReviewWorkspace({
  assetUrls,
  designVersions,
  onApprove,
  onRequestChanges,
  onReviseSpecification,
  project,
  review,
  specificationVersions,
}: {
  assetUrls: Record<string, string | null>;
  designVersions: Array<ArtifactVersion<Design>>;
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  onReviseSpecification: (spec: Specification) => Promise<unknown>;
  project: { title: string; wix?: { previewUrl?: string } };
  review: PendingReview;
  specificationVersions: Array<ArtifactVersion<Specification>>;
}) {
  return (
    <div className="space-y-5">
      <ReviewHeader title={REVIEW_TITLES[review.artifactType]} version={review.version} />
      {review.artifactType === "specification" ? (
        <SpecificationReview
          onApprove={onApprove}
          onRequestChanges={onRequestChanges}
          onReviseSpecification={onReviseSpecification}
          review={review}
          versions={specificationVersions}
        />
      ) : review.artifactType === "design" ? (
        <DesignReview
          assetUrls={assetUrls}
          onApprove={onApprove}
          onRequestChanges={onRequestChanges}
          review={review}
          versions={designVersions}
        />
      ) : (
        <PreviewReview
          onApprove={onApprove}
          onRequestChanges={onRequestChanges}
          project={project}
          review={review}
        />
      )}
    </div>
  );
}

function ReviewHeader({ title, version }: { title: string; version: number }) {
  return (
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
  );
}
