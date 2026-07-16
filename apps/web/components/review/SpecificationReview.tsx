"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { ReviewFeedback, SolutionArchitecture, Specification } from "@factory/shared";
import type { ArtifactVersion, PendingReview } from "@/data/useProjectDetail";
import { SpecificationSummary } from "../SpecificationSummary";
import { ReviewActions } from "./ReviewActions";
import { SpecificationEditor } from "./SpecificationEditor";
import { VersionPicker } from "./VersionPicker";

/** Site-plan review: browse versions, edit the latest inline, approve or send feedback. */
export function SpecificationReview({
  onApprove,
  onRequestChanges,
  onReviseSpecification,
  review,
  solutionArchitecture,
  versions,
}: {
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  onReviseSpecification: (spec: Specification) => Promise<unknown>;
  review: PendingReview;
  solutionArchitecture?: SolutionArchitecture;
  versions: Array<ArtifactVersion<Specification>>;
}) {
  const [selectedVersion, setSelectedVersion] = useState(review.version);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Specification | undefined>(
    review.specification ? structuredClone(review.specification) : undefined,
  );
  const [saving, setSaving] = useState(false);
  const reviewingCurrentVersion = selectedVersion === review.version;
  const displayed =
    versions.find((item) => item.version === selectedVersion)?.data ?? review.specification;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VersionPicker
          onSelect={(version) => {
            setSelectedVersion(version);
            setEditing(false);
          }}
          selectedVersion={selectedVersion}
          versions={versions.map((item) => item.version)}
        />
        {reviewingCurrentVersion && (
          <button
            className="border-outline rounded border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f1f2f4]"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing ? "Cancel editing" : "Edit site plan"}
          </button>
        )}
      </div>

      {editing && draft ? (
        <>
          <SpecificationEditor onChange={setDraft} spec={draft} />
          <div className="flex justify-end">
            <button
              className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white disabled:opacity-40"
              disabled={saving}
              onClick={() => void saveRevision()}
              type="button"
            >
              {saving && <LoaderCircle className="animate-spin" size={14} />}Save as new version
            </button>
          </div>
        </>
      ) : (
        displayed && <SpecificationSummary architecture={solutionArchitecture} spec={displayed} />
      )}

      <ReviewActions
        approveLabel="Approve Site Plan"
        currentVersion={review.version}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        reviewingCurrentVersion={reviewingCurrentVersion}
      />
    </div>
  );
}
