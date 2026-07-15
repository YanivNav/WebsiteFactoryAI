"use client";

import {useQuery} from "convex/react";
import {api} from "@convex/_generated/api";
import {useMemo, useState} from "react";
import {Bell, CircleAlert, CircleHelp, LoaderCircle, Search, UserCircle} from "lucide-react";
import {Doc} from "@convex/_generated/dataModel";
import {STAGES, STAGE_LABELS, Stage} from "@factory/shared";
import Link from "next/link";

type Filter = "all" | "action" | "in-progress" | "live";

export default function Home() {
  const projects = useQuery(api.projects.list);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const actionNeeded = useMemo(() => projects?.filter(project => project.currentStage === "Draft" || project.currentStage.startsWith("WaitingFor")) ?? [], [projects]);
  const inProgress = useMemo(() => projects?.filter(project => project.status === "active" && project.currentStage !== "Draft" && !project.currentStage.startsWith("WaitingFor")) ?? [], [projects]);
  const live = useMemo(() => projects?.filter(project => project.status === "completed") ?? [], [projects]);
  const activeCount = projects?.filter(project => project.status === "active").length ?? 0;

  const filteredProjects = useMemo(() => {
    const source = filter === "action" ? actionNeeded : filter === "in-progress" ? inProgress : filter === "live" ? live : projects ?? [];
    const query = searchQuery.trim().toLowerCase();
    return query ? source.filter(project => project.title.toLowerCase().includes(query)) : source;
  }, [actionNeeded, filter, inProgress, live, projects, searchQuery]);

  return (
    <>
      <header
        className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-outline bg-white/95 px-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-6">
          <span className="hidden text-sm font-extrabold tracking-[-0.02em] sm:inline">Dashboard</span>
          <label
            className="flex h-8 w-[48vw] max-w-80 items-center gap-2 rounded border border-outline bg-[#f4f5f7] px-2.5 text-[#3e4654] transition focus-within:border-[#5d8fd9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#d8e5f9]">
            <Search size={18}/>
            <input aria-label="Search projects"
                   className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-[#697181] "
                   onChange={event => setSearchQuery(event.target.value)} placeholder="Search projects..." type="search"
                   value={searchQuery}/>
          </label>
        </div>
        <div className="flex text-[#283140]">
          {[
            {label: "Notifications", icon: Bell},
            {label: "Help", icon: CircleHelp},
            {label: "Account", icon: UserCircle}
          ].map(({label, icon: Icon}) => (
            <button aria-label={label}
                    className={`grid size-8 place-items-center rounded transition-colors hover:bg-[#f0f1f3] hover:text-primary ${label === "Help" ? "max-sm:hidden" : ""}`}
                    key={label} type="button"><Icon size={20}/></button>
          ))}
        </div>
      </header>

      <main className="px-4 pb-10 pt-4 md:px-6">
        <section>
          <h1 className="m-0 text-2xl font-semibold leading-7.5 tracking-[-0.035em]">Projects</h1>
          <div className="mt-2 flex items-center gap-3.5 text-sm text-[#464d59] max-sm:flex-col max-sm:items-start max-sm:gap-1">
            <span><strong className="font-bold text-ink">{activeCount}</strong> Active Projects</span>
            <i className="h-3.5 w-px bg-outline max-sm:hidden"/>
            <span className="flex items-center gap-1 font-semibold text-primary">
              <CircleAlert size={16}/>
              <strong>{actionNeeded.length}</strong> Actions Required</span>
          </div>
        </section>

        <div className="my-4 mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter projects">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
          <FilterButton active={filter === "action"} emphasized onClick={() => setFilter("action")}>Action Needed <b
            className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">{actionNeeded.length}</b></FilterButton>
          <FilterButton active={filter === "in-progress"} onClick={() => setFilter("in-progress")}>In
            Progress</FilterButton>
          <FilterButton active={filter === "live"} onClick={() => setFilter("live")}>Live</FilterButton>
        </div>
        <ProjectTable loading={projects === undefined} projects={filteredProjects}/>
      </main>
    </>
  );
}

function FilterButton({active, children, emphasized, onClick}: {
  active: boolean;
  children: React.ReactNode;
  emphasized?: boolean;
  onClick: () => void
}) {
  const selected = emphasized ? "border-primary bg-[#edf5ff] text-[#004cb0]" : "border-[#b9c0cf] bg-[#e7e8ea] text-[#171a1f]";
  return <button aria-pressed={active}
                 className={`flex min-h-9 shrink-0 items-center gap-2 rounded border px-4 text-xs font-semibold tracking-[0.04em] transition-colors ${active ? selected : "border-outline bg-[#fafafa] text-[#3d4451] hover:bg-[#eef0f3]"}`}
                 onClick={onClick} type="button">{children}</button>;
}

function ProjectTable({loading, projects}: { loading: boolean; projects: Doc<"projects">[] }) {
  return (
    <div className="overflow-x-auto rounded border border-outline bg-white">
      <table className="w-full min-w-205 table-fixed border-collapse">
        <thead>
        <tr className="h-15 bg-[#f1f2f4] text-left text-[10px] font-bold uppercase tracking-[0.08em] text-[#3d4451]">
          <th className="w-[30%] px-4">Project</th>
          <th className="w-[25%] px-4">Current step</th>
          <th className="w-[15%] px-4">Status</th>
          <th className="w-[10%] px-4">Time in step</th>
          <th className="w-[20%] px-4 text-right">Action</th>
        </tr>
        </thead>
        <tbody>{projects.map(project => <ProjectRow key={project._id} project={project}/>)}</tbody>
      </table>
      {loading && <div
          className="flex min-h-36 flex-col items-center justify-center gap-2 border-t border-outline text-sm text-[#697181]">
          <LoaderCircle className="animate-spin" size={22}/>Loading projects…</div>}
      {!loading && projects.length === 0 && <div
          className="flex min-h-36 flex-col items-center justify-center gap-1 border-t border-outline text-sm text-[#697181]">
          <strong className="text-[#313743]">No projects here</strong><span>Try another filter or search.</span></div>}
    </div>
  );
}

function ProjectRow({project}: { project: Doc<"projects"> }) {
  const stage = project.currentStage as Stage;
  const waiting = stage === "Draft" || stage.startsWith("WaitingFor");
  const completed = stage === "Completed";
  const displayStep = Math.min(Math.max(1, STAGES.indexOf(stage) + 1), 12);
  const actionLabel = stage === "Draft" ? "Start Project" : stage === "WaitingForDesignApproval" ? "Review Design" : stage === "WaitingForSpecificationApproval" ? "Review Plan" : stage === "WaitingForFinalApproval" ? "Review Site" : stage === "WaitingForManualActions" ? "View Actions" : completed ? "Manage Site" : "View Details";

  return (
    <tr className="h-17.5 border-t border-outline text-xs transition-colors hover:bg-[#f9fafb]">
      <td className="px-4 py-2.5">
        <Link className="block w-max max-w-full truncate text-[13px] font-medium text-ink hover:text-primary hover:underline"
              href={`/projects/${project._id}`}>{project.title}</Link>
        <span className="mt-1 block max-w-[90%] truncate font-mono text-[10px] text-[#777f8c]">
          {project.settings.businessName || (project.wix?.liveUrl ? safeHostname(project.wix.liveUrl) : "Wix site in progress")}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 font-medium text-[#4f5765]">
          <span className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${waiting ? "border-primary bg-[#edf5ff] text-primary" : "border-[#bdc4d1] bg-[#eef0f3] text-[#394150]"}`}>
            {displayStep}
          </span>
          <span>{STAGE_LABELS[stage]}</span>
        </div>
        <div className="mt-1.5 flex w-30 gap-0.5">{Array.from({length: 12}, (_, index) =>
          <span className={`relative h-1 flex-1 first:rounded-l last:rounded-r ${index < displayStep ? waiting ? "bg-[#075ec8]" : "bg-[#b8c0d1]" : "bg-[#e4e6e9]"}`}
                key={index}>
            {index === displayStep - 1 &&
                <i className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-white bg-inherit ring-1 ring-current"/>}
          </span>)}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Status waiting={waiting} completed={completed} failed={project.status === "failed"}/>
      </td>
      <td className="px-4 py-2.5 text-[#4e5663]">{formatElapsed(project._creationTime)}</td>
      <td className="px-4 py-2.5 text-right"><Link
        className={`inline-flex min-h-7.5 items-center justify-center rounded border px-3 font-semibold tracking-[0.035em] shadow-sm transition-colors ${waiting ? "border-[#2f78e8] bg-[#347cec] text-white hover:bg-[#2269d6]" : "border-outline bg-white text-[#181b20] hover:bg-[#f2f3f5]"}`}
        href={`/projects/${project._id}`}>{actionLabel}</Link></td>
    </tr>
  );
}

function Status({waiting, completed, failed}: { waiting: boolean; completed: boolean; failed: boolean }) {
  const base = "inline-flex min-h-6 w-max items-center gap-1 rounded border px-2 py-0.5 text-[10px]";
  if (waiting) return <span className={`${base} border-[#b9d5fb] bg-[#edf5ff] font-bold uppercase tracking-[0.09em] text-[#12409e]`}>
    <i className="size-1.5 rounded-full bg-[#3b82f6]"/>Action needed</span>;
  if (completed) return <span className={`${base} border-[#b6dfc6] bg-[#effaf3] font-bold text-[#17693a]`}>
    <i className="size-1.5 rounded-full bg-[#22a75a]"/>Live</span>;
  if (failed) return <span className={`${base} border-[#f1b8b5] bg-[#fff1f0] font-bold text-[#9d2019]`}>
    <i className="size-1.5 rounded-full bg-[#d43b32]"/>Needs attention</span>;
  return <span className={`${base} border-[#c3c9d5] bg-[#f4f5f7] text-[#3e4654]`}>
    Running <LoaderCircle className="animate-spin" size={12}/></span>;
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Wix site";
  }
}

function formatElapsed(createdAt: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - createdAt) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
