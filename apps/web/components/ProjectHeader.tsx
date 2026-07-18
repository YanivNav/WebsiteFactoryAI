"use client";

import Link from "next/link";
import { ChevronRight, CircleHelp, Search, UserCircle } from "lucide-react";

export function ProjectHeader({
  projectTitle,
  activityLabel,
}: {
  projectTitle: string;
  activityLabel: string;
}) {
  return (
    <header className="border-outline sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Link className="hover:text-primary text-[#596170]" href="/">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-[#8a919d]" />
        <strong className="text-ink truncate">{projectTitle}</strong>
        <span className="text-primary ml-3 hidden rounded border border-[#b9d5fb] bg-[#edf5ff] px-2 py-1 text-[10px] font-bold tracking-[0.08em] uppercase sm:inline">
          {activityLabel}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[#283140]">
        <button
          aria-label="Search"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]"
          type="button"
        >
          <Search size={19} />
        </button>
        <button
          aria-label="Help"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3] max-sm:hidden"
          type="button"
        >
          <CircleHelp size={19} />
        </button>
        <button
          aria-label="Account"
          className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]"
          type="button"
        >
          <UserCircle size={20} />
        </button>
      </div>
    </header>
  );
}
