"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import type { Artifact } from "@factory/shared";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function ArtifactVersionPicker({
  label,
  projectId,
  versions,
  selectedArtifactId,
}: {
  label: string;
  projectId: Id<"projects">;
  versions: Artifact[];
  selectedArtifactId?: string;
}) {
  const selectVersion = useMutation(api.projects.selectArtifactVersion);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  if (!versions.length) return null;

  async function select(artifact: Artifact) {
    if (artifact.id === selectedArtifactId || selectingId) return;
    setSelectingId(artifact.id);
    try {
      await selectVersion({
        projectId,
        artifactId: artifact.id as Id<"artifacts">,
      });
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-ink-muted mr-1 text-[10px] font-bold tracking-[0.1em] uppercase">
        {label}
      </span>
      <div aria-label={label} className="flex flex-wrap gap-1.5" role="group">
        {versions.map((artifact) => {
          const selected = artifact.id === selectedArtifactId;
          return (
            <button
              aria-pressed={selected}
              className={`flex h-8 items-center gap-1 rounded border px-2.5 text-xs font-semibold transition-colors ${
                selected
                  ? "border-primary bg-[#d8e2ff] text-[#004395]"
                  : "border-outline text-ink-muted hover:border-primary hover:text-primary bg-white"
              }`}
              disabled={selectingId !== null}
              key={artifact.id}
              onClick={() => void select(artifact)}
              type="button"
            >
              {selected && <Check size={13} />}
              Version {artifact.version}
            </button>
          );
        })}
      </div>
      {versions.length > 1 && (
        <span className="text-ink-muted basis-full text-xs">
          The selected version is the one that will be used when you continue.
        </span>
      )}
    </div>
  );
}
