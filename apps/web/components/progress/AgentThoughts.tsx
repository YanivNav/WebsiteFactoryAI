"use client";

import { useEffect, useRef } from "react";
import { Brain, Code, AlertTriangle, MessageCircle, FileText } from "lucide-react";
import type { ProjectDetail } from "@/data/useProjectDetail";

interface Thought {
  text: string;
  kind: "thought" | "cmd" | "msg" | "files" | "error";
}

export function AgentThoughts({ detail }: { detail: ProjectDetail }) {
  const endRef = useRef<HTMLDivElement>(null);
  const thoughts = (detail.progress?.data as { thinking?: Thought[] } | undefined)?.thinking ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thoughts.length]);

  if (thoughts.length === 0) return null;

  return (
    <section className="border-outline rounded border bg-white p-4">
      <h3 className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
        <Brain size={16} className="text-primary" /> Agent thinking
      </h3>
      <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
        {thoughts.map((item, i) => (
          <ThoughtRow key={i} item={item} />
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}

function ThoughtRow({ item }: { item: Thought }) {
  const icon =
    item.kind === "cmd" ? (
      <Code size={12} className="mt-0.5 shrink-0 text-[#924700]" />
    ) : item.kind === "error" ? (
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#a82922]" />
    ) : item.kind === "msg" ? (
      <MessageCircle size={12} className="mt-0.5 shrink-0 text-[#0058be]" />
    ) : item.kind === "files" ? (
      <FileText size={12} className="mt-0.5 shrink-0 text-[#17693a]" />
    ) : null;

  const bg =
    item.kind === "error"
      ? "bg-[#fff5f5]"
      : item.kind === "cmd"
        ? "bg-[#faf8f0]"
        : item.kind === "files"
          ? "bg-[#f0faf4]"
          : "";

  const textColor =
    item.kind === "error" ? "text-[#a82922]" : item.kind === "cmd" ? "text-[#924700]" : "text-ink-muted";

  return (
    <div className={`flex items-start gap-1.5 rounded px-2 py-1 text-xs ${bg}`}>
      {icon}
      <span className={`whitespace-pre-wrap break-words ${textColor}`}>{item.text}</span>
    </div>
  );
}
