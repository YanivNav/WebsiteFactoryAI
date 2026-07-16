"use client";

import { useState } from "react";
import { Check, ExternalLink, Globe2, Send, Sparkles } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";

/** The Completed resting state: the live site, plus the change-request queue. */
export function LiveWorkspace({
  changeRequests,
  onSubmitChange,
  project,
}: {
  changeRequests: Array<Doc<"changeRequests">>;
  onSubmitChange: (description: string) => Promise<unknown>;
  project: { title: string; wix?: { liveUrl?: string; previewUrl?: string } };
}) {
  const [change, setChange] = useState("");
  async function submit() {
    if (!change.trim()) return;
    await onSubmitChange(change.trim());
    setChange("");
  }
  return (
    <div className="space-y-5">
      <section className="border-outline flex flex-col justify-between gap-4 rounded border bg-white p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#22a75a]" />
            <span className="text-[10px] font-bold tracking-[0.1em] text-[#17693a] uppercase">
              Live & active
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            {project.wix?.liveUrl ? safeHostname(project.wix.liveUrl) : project.title}
          </h1>
        </div>
        {project.wix?.liveUrl && (
          <a
            className="bg-primary inline-flex min-h-10 items-center justify-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0]"
            href={project.wix.liveUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open live site <ExternalLink size={15} />
          </a>
        )}
      </section>
      <section className="border-outline overflow-hidden rounded border bg-white">
        <div className="border-outline flex h-11 items-center gap-2 border-b bg-[#e1e3e4] px-4">
          <i className="size-2.5 rounded-full bg-[#d28f8d]" />
          <i className="size-2.5 rounded-full bg-[#c9a979]" />
          <i className="size-2.5 rounded-full bg-[#82a8d4]" />
          <span className="border-outline mx-auto max-w-md truncate rounded border bg-white px-5 py-1 text-[10px] text-[#596170]">
            {project.wix?.liveUrl ?? "Live Wix site"}
          </span>
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 bg-[#f0f2f4] p-8 text-center">
          <Globe2 size={36} className="text-primary" />
          <p className="font-semibold">Your Wix site is live</p>
          <p className="text-sm text-[#697181]">
            Use the verified live-site link above to view or manage it.
          </p>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="border-outline flex min-h-80 flex-col rounded border bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary" size={19} />
            <h2 className="text-lg font-semibold">Continuous improvement</h2>
          </div>
          <p className="mt-2 text-sm leading-5 text-[#596170]">
            Describe the next client change in plain language. It will join the project queue and
            rebuild against the approved site.
          </p>
          <textarea
            className="border-outline focus:border-primary mt-5 min-h-32 w-full resize-y rounded border bg-[#f8f9fa] p-3 text-sm outline-none placeholder:text-[#737b88] focus:ring-2 focus:ring-[#d8e2ff]"
            onChange={(event) => setChange(event.target.value)}
            placeholder="e.g. Update the summer menu and make the hero image warmer…"
            value={change}
          />
          <div className="mt-auto flex justify-end pt-5">
            <button
              className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-5 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-40"
              disabled={!change.trim()}
              onClick={() => void submit()}
              type="button"
            >
              <Send size={15} />
              Request change
            </button>
          </div>
        </section>
        <ChangeHistory changeRequests={changeRequests} />
      </div>
    </div>
  );
}

function ChangeHistory({ changeRequests }: { changeRequests: Array<Doc<"changeRequests">> }) {
  const recent = changeRequests.slice(-4).reverse();
  return (
    <section className="border-outline rounded border bg-[#f3f4f5] p-4">
      <h2 className="text-sm font-semibold">Change history</h2>
      <div className="mt-3 space-y-2">
        {recent.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#737b88]">No changes requested yet.</p>
        ) : (
          recent.map((item) => (
            <article className="border-outline rounded border bg-white p-3" key={item._id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-4 font-semibold">{item.description}</p>
                <Check
                  size={13}
                  className={item.status === "done" ? "text-[#22a75a]" : "text-[#d18a00]"}
                />
              </div>
              <p className="mt-2 text-[10px] tracking-[0.08em] text-[#697181] uppercase">
                {item.status} · {formatDate(item._creationTime)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Live Wix site";
  }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
