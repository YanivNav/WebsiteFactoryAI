"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { Terminal } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

/**
 * The live dev-server console. Streams the Astro/Wix dev output so runtime
 * errors (an API route throwing a 500, a bad import) are actually visible —
 * the one place you can see *why* a page misbehaves. Present once a dev server
 * has been started for the project.
 *
 * It subscribes to its own `devConsole` query (a large log tail), separate from
 * the project detail, so streaming never re-runs that heavier query and a full
 * stack trace is retained.
 */
export function DevConsole({
  projectId,
  session,
}: {
  projectId: Id<"projects">;
  session?: Doc<"devSessions">;
}) {
  const data = useQuery(api.projects.devConsole, session ? { projectId } : "skip");
  const logs = data?.logs ?? [];
  const endRef = useRef<HTMLDivElement>(null);

  // Autoscroll to the newest line as output streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [logs.length]);

  // Only meaningful while the server is (coming) up — hide it once it's stopped
  // or crashed, so stale output isn't mistaken for a running server.
  if (!session || (session.status !== "starting" && session.status !== "running")) {
    return null;
  }

  return (
    <section className="border-outline rounded border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ink flex items-center gap-2 text-sm font-semibold">
          <Terminal size={14} /> Dev server logs
        </h3>
        <DevStatusBadge status={session.status} />
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-[#8b949e]">
            {session.status === "starting" ? "Starting the dev server…" : "No output yet."}
          </p>
        ) : (
          logs.map((log) => (
            <div
              key={log._id}
              className={`break-all whitespace-pre-wrap ${
                log.stream === "err" ? "text-[#ff7b72]" : "text-[#c9d1d9]"
              }`}
            >
              {log.line || " "}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}

function DevStatusBadge({ status }: { status: Doc<"devSessions">["status"] }) {
  const styles: Record<Doc<"devSessions">["status"], { label: string; className: string; pulse?: boolean }> = {
    starting: { label: "Starting", className: "border-[#b9d5fb] bg-[#edf5ff] text-[#12409e]", pulse: true },
    running: { label: "Running", className: "border-[#b6dfc6] bg-[#effaf3] text-[#17693a]", pulse: true },
    stopped: { label: "Stopped", className: "border-outline bg-canvas text-ink-muted" },
    error: { label: "Error", className: "border-[#f2c2bf] bg-[#fff5f5] text-[#a82922]" },
  };
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${style.className}`}
    >
      <i
        className={`size-1.5 rounded-full ${
          status === "running" ? "bg-[#22a75a]" : status === "error" ? "bg-[#a82922]" : "bg-current"
        } ${style.pulse ? "animate-pulse" : ""}`}
      />
      {style.label}
    </span>
  );
}
