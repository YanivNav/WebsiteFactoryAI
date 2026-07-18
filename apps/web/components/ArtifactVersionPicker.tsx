"use client";

import { Check } from "lucide-react";
import type { Artifact } from "@factory/shared";

export function ArtifactVersionPicker({
  label,
  versions,
  viewedArtifactId,
  approvedArtifactId,
  proposedArtifactId,
  onView,
}: {
  label: string;
  versions: Artifact[];
  viewedArtifactId?: string;
  approvedArtifactId?: string;
  proposedArtifactId?: string;
  onView: (artifactId: string) => void;
}) {
  if (versions.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-ink-muted mr-1 text-[10px] font-bold tracking-[0.1em] uppercase">
        {label}
      </span>
      <div aria-label={label} className="flex flex-wrap gap-1.5" role="group">
        {versions.map((artifact) => {
          const viewed = artifact.id === viewedArtifactId;
          return (
            <button
              aria-pressed={viewed}
              className={`flex h-8 items-center gap-1 rounded border px-2.5 text-xs font-semibold transition-colors ${
                viewed
                  ? "border-primary bg-[#d8e2ff] text-[#004395]"
                  : "border-outline text-ink-muted hover:border-primary hover:text-primary bg-white"
              }`}
              key={artifact.id}
              onClick={() => onView(artifact.id)}
              type="button"
            >
              {viewed && <Check size={13} />}
              Version {artifact.version}
              {artifact.id === approvedArtifactId && (
                <span className="text-[9px] font-bold tracking-wide uppercase">Approved</span>
              )}
              {artifact.id === proposedArtifactId && artifact.id !== approvedArtifactId && (
                <span className="text-[9px] font-bold tracking-wide uppercase">New</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
