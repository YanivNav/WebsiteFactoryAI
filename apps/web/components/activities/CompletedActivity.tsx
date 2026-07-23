import type { ProjectDetail } from "@/data/useProjectDetail";
import { ExternalLink, PartyPopper } from "lucide-react";
import { SiteChangeRequest } from "../SiteChangeRequest";

/**
 * A published (resting) project: the live site plus a plain-language change box.
 * Requesting a change re-enters the build stage — the same refine loop, reused
 * post-publish.
 */
export function CompletedActivity({ detail }: { detail: ProjectDetail }) {
  const release = detail.artifacts.siteRelease[0];

  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-5">
        <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
          <PartyPopper size={16} className="text-primary" /> Your site is live
        </h3>
        {release?.data.liveUrl && (
          <a
            className="text-primary mt-3 flex w-fit items-center gap-1 text-sm underline hover:no-underline"
            href={release.data.liveUrl}
            rel="noreferrer"
            target="_blank"
          >
            {release.data.liveUrl} <ExternalLink size={13} />
          </a>
        )}
      </section>
      <SiteChangeRequest detail={detail} />
    </div>
  );
}
