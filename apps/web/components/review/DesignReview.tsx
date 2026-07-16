"use client";

import { useState } from "react";
import type { Design, ReviewFeedback } from "@factory/shared";
import type { ArtifactVersion, PendingReview } from "@/data/useProjectDetail";
import { DesignGallery } from "./DesignGallery";
import { ReviewActions } from "./ReviewActions";
import { VersionPicker } from "./VersionPicker";

/** Design review: browse versions, give per-screen feedback, approve or send feedback. */
export function DesignReview({
  assetUrls,
  onApprove,
  onRequestChanges,
  review,
  versions,
}: {
  assetUrls: Record<string, string | null>;
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  review: PendingReview;
  versions: Array<ArtifactVersion<Design>>;
}) {
  const [selectedVersion, setSelectedVersion] = useState(review.version);
  const reviewingCurrentVersion = selectedVersion === review.version;
  const displayed = versions.find((item) => item.version === selectedVersion)?.data ?? review.design;

  return (
    <div className="space-y-5">
      <VersionPicker
        onSelect={setSelectedVersion}
        selectedVersion={selectedVersion}
        versions={versions.map((item) => item.version)}
      />

      {displayed && (
        <DesignGallery
          assetUrls={assetUrls}
          canRevise={reviewingCurrentVersion}
          design={displayed}
          onScreenFeedback={(screen, comment) =>
            onRequestChanges([
              {
                comment,
                screen: { screenId: screen.stitchScreenId, pageTitle: screen.pageTitle },
              },
            ])
          }
        />
      )}

      <ReviewActions
        approveLabel="Approve Design"
        currentVersion={review.version}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        reviewingCurrentVersion={reviewingCurrentVersion}
      />
    </div>
  );
}
