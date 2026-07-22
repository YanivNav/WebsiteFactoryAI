"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
  // agree on the current version. Two cases to handle:
  //   1. A newly *proposed* version arrived (a revision produced a new version):
  //      follow it, even if the previously-viewed version is still valid.
  //   2. The viewed version is no longer valid (task/subject changed): repair it.
  // A manual version-chip click changes viewedArtifactId but not proposedArtifactId,
  // so it is never overridden.
  const lastProposed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (proposedArtifactId && proposedArtifactId !== lastProposed.current) {
      lastProposed.current = proposedArtifactId;
      if (proposedArtifactId !== viewedArtifactId) onView(proposedArtifactId);
      return;
    }
    if (initialId && !versions.some((version) => version.id === viewedArtifactId)) {
      onView(initialId);
    }
  }, [proposedArtifactId, initialId, versions, viewedArtifactId, onView]);

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
