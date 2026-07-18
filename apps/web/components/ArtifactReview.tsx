"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Artifact, ArtifactType } from "@factory/shared";
import { ArtifactVersionPicker } from "./ArtifactVersionPicker";

export function ArtifactReview<T extends ArtifactType>({
  versions,
  proposedArtifactId,
  approvedArtifactId,
  versionLabel,
  renderArtifact,
  renderActions,
}: {
  versions: Artifact<T>[];
  proposedArtifactId?: string;
  approvedArtifactId?: string;
  versionLabel: string;
  renderArtifact: (artifact: Artifact<T>) => ReactNode;
  renderActions?: (artifact: Artifact<T>) => ReactNode;
}) {
  const initialId = proposedArtifactId ?? approvedArtifactId ?? versions[0]?.id;
  const [viewedArtifactId, setViewedArtifactId] = useState(initialId);

  useEffect(() => setViewedArtifactId(initialId), [initialId]);

  const artifact = useMemo(
    () => versions.find((version) => version.id === viewedArtifactId) ?? versions[0],
    [versions, viewedArtifactId],
  );
  if (!artifact) return null;

  return (
    <div className="flex flex-col gap-4">
      {versions.length > 1 && (
        <section className="border-outline rounded border bg-white p-4">
          <ArtifactVersionPicker
            approvedArtifactId={approvedArtifactId}
            label={versionLabel}
            onView={setViewedArtifactId}
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
