"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { STAGE_LABELS, type Stage } from "@factory/shared";
import { api } from "@convex/_generated/api";

export default function Home() {
  const projects = useQuery(api.projects.list);
  const create = useMutation(api.projects.create);
  const start = useMutation(api.projects.start);

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !brief.trim()) return;
    const id = await create({ title, brief });
    // Leaving Draft is the only manual kick. After this the worker takes over and
    // the project advances on its own until it needs a human.
    await start({ projectId: id });
    setTitle("");
    setBrief("");
  }

  return (
    <main className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Your websites</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Describe what you need. We&apos;ll plan it, design it, build it, and put it
          live — checking with you along the way.
        </p>
      </header>

      <form
        onSubmit={onCreate}
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your site (e.g. Clay & Co.)"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What is your business, and what should visitors be able to do? (e.g. A ceramics studio in Tel Aviv. People should be able to browse my work and book a workshop.)"
          rows={3}
          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          disabled={!title.trim() || !brief.trim()}
        >
          Start building
        </button>
      </form>

      <section className="space-y-2">
        {projects === undefined && <p className="text-sm text-neutral-400">Loading…</p>}
        {projects?.length === 0 && (
          <p className="text-sm text-neutral-400">No websites yet.</p>
        )}
        {projects?.map((p) => (
          <Link
            key={p._id}
            href={`/projects/${p._id}`}
            className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-300"
          >
            <span className="font-medium">{p.title}</span>
            {/* The user never sees the internal stage name. STAGE_LABELS is the only
                place enums become human words. */}
            <span className="text-sm text-neutral-500">
              {STAGE_LABELS[p.currentStage as Stage]}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
