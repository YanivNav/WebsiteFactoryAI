"use client";

import { useState } from "react";
import { Check, MessageSquareText } from "lucide-react";
import type { ReviewFeedback } from "@factory/shared";

/**
 * The two ways out of any review gate: approve, or leave feedback. Shared by every
 * review view. When an older version is displayed, the actions are replaced by a
 * read-only notice — only the latest version can be approved or revised.
 */
export function ReviewActions({
  approveLabel,
  currentVersion,
  onApprove,
  onRequestChanges,
  reviewingCurrentVersion,
}: {
  approveLabel: string;
  currentVersion: number;
  onApprove: () => void;
  onRequestChanges: (feedback: ReviewFeedback[]) => Promise<unknown>;
  reviewingCurrentVersion: boolean;
}) {
  const [comment, setComment] = useState("");

  if (!reviewingCurrentVersion) {
    return (
      <section className="border-outline rounded border bg-[#f1f2f4] p-4 text-sm text-[#596170]">
        This is a previous version and is available for reference only. Return to version{" "}
        {currentVersion} to approve it or request changes.
      </section>
    );
  }

  async function submitComment() {
    if (!comment.trim()) return;
    await onRequestChanges([{ comment: comment.trim() }]);
    setComment("");
  }

  return (
    <section className="border-outline rounded border bg-[#f1f2f4] p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText size={18} className="text-primary" />
        Review feedback
      </div>
      <textarea
        className="border-outline focus:border-primary min-h-24 w-full resize-y rounded border bg-white p-3 text-sm outline-none placeholder:text-[#717987] focus:ring-2 focus:ring-[#d8e2ff]"
        onChange={(event) => setComment(event.target.value)}
        placeholder="Describe exactly what should change…"
        value={comment}
      />
      <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row">
        <button
          className="min-h-10 rounded border border-[#727785] bg-white px-5 text-xs font-semibold tracking-[0.04em] hover:bg-[#f5f6f7] disabled:opacity-40"
          disabled={!comment.trim()}
          onClick={() => void submitComment()}
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
  );
}
