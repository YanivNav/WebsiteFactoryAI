"use client";

import { FormEvent, useEffect, useState } from "react";
import { LayoutDashboard, LoaderCircle, Plus, Rocket, X } from "lucide-react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";

const navigation = [{ label: "Dashboard", href: "/", icon: LayoutDashboard, active: true }];

export function Navbar() {
  const [showNewProject, setShowNewProject] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="border-outline border-b px-3 py-4 md:px-4">
        <div className="text-primary flex items-center justify-center gap-2 md:justify-start">
          <Rocket size={24} strokeWidth={2.2} />
          <span className="hidden text-lg font-bold tracking-[-0.02em] whitespace-nowrap md:inline">
            Website Factory
          </span>
        </div>
        <p className="text-ink-muted mt-5 hidden text-xs md:block">Wix Project Fleet</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {navigation.map(({ label, href, icon: Icon, active }) => (
          <Link
            className={`flex min-h-10 items-center justify-center gap-3 rounded px-4 text-xs font-semibold tracking-[0.06em] transition-colors md:justify-start ${active ? "bg-[#e8e9eb] text-[#0064d5]" : "hover:text-primary text-[#303744] hover:bg-[#eceef0]"}`}
            href={href}
            key={label}
          >
            <Icon size={22} />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-outline border-t p-3 md:p-4">
        <button
          className="bg-primary flex min-h-9 w-full items-center justify-center gap-2 rounded text-xs font-semibold tracking-[0.03em] text-white transition-colors hover:bg-[#064aa0]"
          onClick={() => setShowNewProject(true)}
          type="button"
        >
          <Plus size={18} />
          <span className="hidden md:inline">New Project</span>
        </button>
      </div>
      {showNewProject && <NewProjectDialog onClose={() => setShowNewProject(false)} />}
    </div>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const createProject = useMutation(api.projects.create);
  const startProject = useMutation(api.projects.start);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !brief.trim()) return;
    setBusy(true);
    try {
      const projectId = await createProject({ title: title.trim(), brief: brief.trim() });
      await startProject({ projectId });
      onClose();
      router.push(`/projects/${projectId}`);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-2 block w-full rounded border border-outline px-2.5 py-2 font-normal tracking-normal text-ink outline-none placeholder:text-[#737d8e] focus:border-primary focus:ring-2 focus:ring-[#d9e7fb]";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(25,28,29,.34)] p-6 backdrop-blur-[3px]"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <form
        className="text-ink w-full max-w-2xl rounded-xl border border-[#d3d7df] bg-white px-5 py-6 shadow-[0_20px_50px_rgba(20,25,35,.25)] md:px-8 md:py-9"
        onSubmit={submit}
      >
        <div className="mb-7 flex items-center justify-between">
          <h2 className="m-0 text-2xl font-bold tracking-[-0.03em]">New Project</h2>
          <button
            aria-label="Close"
            className="grid place-items-center border-0 bg-transparent text-[#3d4654]"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X size={22} />
          </button>
        </div>
        <label className="mt-5 block text-xs font-semibold tracking-[0.04em]">
          Client / Site Name
          <input
            autoFocus
            className={field}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Enter client name"
            required
            value={title}
          />
        </label>
        <label className="mt-5 block text-xs font-semibold tracking-[0.04em]">
          Project Description
          <span className="my-2 block font-normal tracking-normal text-[#3e4654]">
            Describe the client’s business. What do they do, and what should visitors be able to do
            on the site?
          </span>
          <textarea
            className={`${field} min-h-[120px] resize-y leading-6`}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="e.g., A boutique organic bakery in Brooklyn. They need a site to showcase their daily menu, handle pre-orders, and allow customers to book cake tasting appointments."
            required
            rows={5}
            value={brief}
          />
        </label>
        <div className="mt-8 flex items-center justify-end gap-7 md:mt-11">
          <button
            className="border-0 bg-transparent font-semibold text-[#0052b8] disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="bg-primary inline-flex min-h-9 min-w-20 items-center justify-center gap-2 rounded px-4 text-xs font-semibold text-white transition-colors hover:bg-[#064aa0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !title.trim() || !brief.trim()}
            type="submit"
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" size={16} /> Starting…
              </>
            ) : (
              "Start"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
