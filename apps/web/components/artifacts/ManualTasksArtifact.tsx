"use client";

import { useState } from "react";
import type { Artifact, ManualTasks } from "@factory/shared";
import { Bot, CircleHelp, ExternalLink, Wrench } from "lucide-react";

type ManualTaskItem = ManualTasks["items"][number];

/**
 * The build's questions + the steps it genuinely couldn't automate.
 *
 * A task offers up to two ways forward: open the exact Wix page and do it
 * yourself, or have the factory do it in a browser. The second is deliberately
 * gated behind an explicit plan — it acts on the real Wix account — and is
 * stubbed until the browser-automation engine exists.
 */
export function ManualTasksList({ items }: { items: ManualTasks["items"] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-outline rounded border bg-white p-4">
      <h4 className="text-ink text-sm font-semibold">Needs your attention</h4>
      <ul className="mt-3 flex flex-col gap-4">
        {items.map((item) => (
          <ManualTaskRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ManualTaskRow({ item }: { item: ManualTaskItem }) {
  const [showAssist, setShowAssist] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const Icon = item.kind === "question" ? CircleHelp : Wrench;

  return (
    <li className="flex items-start gap-3">
      <Icon size={16} className="text-ink-muted mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{item.title}</p>
        <p className="text-ink-muted text-xs">{item.detail}</p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {item.dashboardUrl && (
            <a
              className="text-primary flex w-fit items-center gap-1 text-xs underline hover:no-underline"
              href={item.dashboardUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in Wix <ExternalLink size={12} />
            </a>
          )}
          {item.assist && (
            <button
              type="button"
              onClick={() => setShowAssist((v) => !v)}
              className="text-primary flex w-fit items-center gap-1 text-xs underline hover:no-underline"
            >
              <Bot size={12} /> Do it for me
            </button>
          )}
          {item.evidence && (
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              className="text-ink-muted hover:text-ink text-xs underline hover:no-underline"
            >
              {showEvidence ? "Hide" : "Why isn't this automatic?"}
            </button>
          )}
        </div>

        {showEvidence && item.evidence && (
          <p className="bg-canvas text-ink-muted mt-2 rounded border border-dashed px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {item.evidence}
          </p>
        )}

        {showAssist && item.assist && (
          <div className="border-outline bg-canvas mt-2 rounded border p-3">
            <p className="text-ink text-xs font-semibold">What I'd do</p>
            <p className="text-ink-muted mt-0.5 text-xs">{item.assist.plan}</p>
            <p className="text-ink mt-2 text-xs font-semibold">How I'd confirm it worked</p>
            <p className="text-ink-muted mt-0.5 text-xs">{item.assist.verification}</p>
            <button
              type="button"
              disabled
              className="bg-primary mt-3 rounded px-3 py-1.5 text-xs font-medium text-white opacity-50"
            >
              Run it in my browser
            </button>
            <p className="text-ink-muted mt-1.5 text-[11px]">
              Not wired up yet — use “Open in Wix” for now.
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

export function ManualTasksView({ artifact }: { artifact: Artifact<"manualTasks"> }) {
  const items = artifact.data.items;
  if (items.length === 0) {
    return <p className="text-ink-muted text-sm">Nothing needs your attention.</p>;
  }
  return <ManualTasksList items={items} />;
}
