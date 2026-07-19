"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import type { Artifact, ArtifactType } from "@factory/shared";
import { ArtifactVersionPicker } from "./ArtifactVersionPicker";

export function ArtifactReview<T extends ArtifactType>({
  versions,
  proposedArtifactId,
  approvedArtifactId,
  versionLabel,
  viewedArtifactId,
  onView,
  renderArtifact,
  renderActions,
}: {
  versions: Artifact<T>[];
  proposedArtifactId?: string;
  approvedArtifactId?: string;
  versionLabel: string;
  viewedArtifactId?: string;
  onView: (artifactId: string) => void;
  renderArtifact: (artifact: Artifact<T>) => ReactNode;
  renderActions?: (artifact: Artifact<T>) => ReactNode;
}) {
  const initialId = proposedArtifactId ?? approvedArtifactId ?? versions[0]?.id;

  // Selection is owned by the workspace so the header (revisit) and this review
  // agree on the current version. Seed or repair it whenever the versions change.
  useEffect(() => {
    if (initialId && !versions.some((version) => version.id === viewedArtifactId)) {
      onView(initialId);
    }
  }, [initialId, versions, viewedArtifactId, onView]);

  const artifact = useMemo(
    () =>
      versions.find((version) => version.id === viewedArtifactId) ??
      versions.find((version) => version.id === initialId) ??
      versions[0],
    [versions, viewedArtifactId, initialId],
  );
  if (!artifact) return null;

  return (
    <div className="flex flex-col gap-4">
      {versions.length > 1 && (
        <section className="border-outline rounded border bg-white p-4">
          <ArtifactVersionPicker
            approvedArtifactId={approvedArtifactId}
            label={versionLabel}
            onView={onView}
            proposedArtifactId={proposedArtifactId}
            versions={versions}
            viewedArtifactId={artifact.id}
          />
          <p className="text-ink-muted mt-2 text-xs">
            Browsing a version does not change the project until you continue with it.
          </p>
        </section>
      )}
      {renderArtifact(artifact)}
      {renderActions?.(artifact)}
    </div>
  );
}
