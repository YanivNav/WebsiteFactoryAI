import type { Artifact } from "@factory/shared";
import { ExternalLink, PartyPopper } from "lucide-react";

/** The published site: shows the live URL. */
export function SiteReleaseView({ artifact }: { artifact: Artifact<"siteRelease"> }) {
  return (
    <section className="border-outline rounded border bg-white p-5">
      <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
        <PartyPopper size={16} className="text-primary" /> Your site is live
      </h3>
      <a
        className="text-primary mt-3 flex w-fit items-center gap-1 text-sm underline hover:no-underline"
        href={artifact.data.liveUrl}
        rel="noreferrer"
        target="_blank"
      >
        {artifact.data.liveUrl} <ExternalLink size={13} />
      </a>
    </section>
  );
}
