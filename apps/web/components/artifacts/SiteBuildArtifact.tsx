import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Artifact } from "@factory/shared";
import type { Id } from "@convex/_generated/dataModel";
import { ExternalLink, MonitorPlay } from "lucide-react";
import type { ProjectDetail } from "@/data/useProjectDetail";
import { useUserTask } from "@/data/useUserTask";
import { ConfirmAction } from "../ConfirmAction";
import { ManualTasksList } from "./ManualTasksArtifact";
import { WebsiteContentForm } from "./WebsiteContentArtifact";

/**
 * The refine-review subject: a preview of the built site, the owner's content
 * form, and anything that needs their attention. Approving (Continue) advances
 * to publish; "Request changes" (in the surrounding review actions) re-runs the
 * build with feedback.
 */
export function SiteBuildArtifact({
  artifact,
  taskId,
  detail,
}: {
  artifact: Artifact<"siteBuild">;
  taskId?: Id<"userTasks">;
  detail?: ProjectDetail;
}) {
  const build = artifact.data;
  const { applyContent, busy } = useUserTask();
  const rebuildSiteClean = useMutation(api.projects.rebuildSiteClean);
  const revertSiteTo = useMutation(api.projects.revertSiteTo);
  // Git holds the site's version history: an older build can be restored.
  const isLatest = detail?.artifacts.siteBuild[0]?.id === artifact.id;

  const content = detail?.artifacts.websiteContent.find((a) => a.id === build.contentArtifactId);
  const manual = detail?.artifacts.manualTasks.find((a) => a.id === build.manualTasksArtifactId);

  const rebuild = () => {
    if (!detail) return;
    void rebuildSiteClean({ projectId: detail.project._id as Id<"projects"> });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-4">
        <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
          <MonitorPlay size={16} className="text-primary" /> Your site
        </h3>
        {build.summary && <p className="text-ink-muted mt-2 text-sm">{build.summary}</p>}
        {/* The preview opens in a new tab — Wix preview pages can't be embedded
            in an iframe (framing is blocked and they need your Wix session). */}
        {build.previewUrl ? (
          <a
            className="bg-primary mt-3 inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            href={build.previewUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open preview in a new tab <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-ink-muted mt-3 text-xs">
            No preview yet — request a change describing what you&apos;d like fixed.
          </p>
        )}
        {detail && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <ConfirmAction
              label="Rebuild code from scratch"
              message="Replaces the current generated code (kept in git history). Content, Wix site, and design stay."
              confirmLabel="Rebuild"
              className="text-ink-muted hover:text-ink text-xs underline"
              onConfirm={rebuild}
            />
            {!isLatest && (
              <ConfirmAction
                label="Restore this version"
                message="Brings the site's code back to this version. Newer versions stay in history."
                confirmLabel="Restore"
                className="text-ink-muted hover:text-ink text-xs underline"
                onConfirm={() =>
                  void revertSiteTo({
                    projectId: detail.project._id as Id<"projects">,
                    buildArtifactId: artifact.id as Id<"artifacts">,
                  })
                }
              />
            )}
          </div>
        )}
      </section>

      {manual && <ManualTasksList items={manual.data.items} />}

      {content && taskId && (
        <WebsiteContentForm
          key={content.id}
          items={content.data.items}
          busy={busy === "applyContent"}
          onApply={(items) =>
            void applyContent({ userTaskId: taskId, sourceArtifactId: artifact.id as Id<"artifacts">, items })
          }
        />
      )}
    </div>
  );
}
