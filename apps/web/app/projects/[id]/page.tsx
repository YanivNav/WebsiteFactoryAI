"use client";

import {use, useState} from "react";
import Link from "next/link";
import {useMutation, useQuery} from "convex/react";
import {Check, ChevronDown, ChevronRight, CircleAlert, CircleHelp, ExternalLink, Globe2, LoaderCircle, MessageSquareText, Monitor, Rocket, Search, Send, Sparkles, UserCircle} from "lucide-react";
import {isWaitingStage, STAGES, STAGE_LABELS, type Specification, type Stage} from "@factory/shared";
import {api} from "@convex/_generated/api";
import type {Id} from "@convex/_generated/dataModel";
import {SpecificationSummary} from "../../../components/SpecificationSummary";

export default function ProjectPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const projectId = id as Id<"projects">;
  const data = useQuery(api.projects.detail, {projectId});
  const approve = useMutation(api.reviews.approve);
  const requestChanges = useMutation(api.reviews.requestChanges);
  const completeTask = useMutation(api.manualTasks.complete);
  const requestChange = useMutation(api.changeRequests.create);
  const [comment, setComment] = useState("");
  const [change, setChange] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);

  if (data === undefined) return <CenteredState><LoaderCircle className="animate-spin"/>Loading project…</CenteredState>;
  if (data === null) return <CenteredState><CircleAlert/>Project not found.</CenteredState>;

  const {project, logs, manualTasks, artifacts, pendingReview, changeRequests} = data;
  const stage = project.currentStage as Stage;
  const blockingTasks = manualTasks.filter(task => !task.completed);
  const reviewedArtifact = pendingReview ? artifacts.find(artifact => artifact._id === pendingReview.artifactId) : undefined;
  const specification = reviewedArtifact && pendingReview?.artifactType === "specification" ? reviewedArtifact.data as Specification : undefined;

  async function submitReviewChanges() {
    if (!pendingReview || !comment.trim()) return;
    await requestChanges({reviewId: pendingReview._id, comments: [comment.trim()]});
    setComment("");
  }

  async function submitChange() {
    if (!change.trim()) return;
    await requestChange({projectId, description: change.trim()});
    setChange("");
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <ProjectHeader projectTitle={project.title} stage={stage}/>
      <div className="flex min-h-[calc(100vh-56px)]">
        <LifecycleRail lastError={project.lastError} onToggleTechnical={() => setShowTechnical(value => !value)} showTechnical={showTechnical} stage={stage}/>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            {pendingReview && (
              <ReviewWorkspace
                artifactType={pendingReview.artifactType}
                comment={comment}
                onApprove={() => approve({reviewId: pendingReview._id})}
                onCommentChange={setComment}
                onRequestChanges={submitReviewChanges}
                project={project}
                specification={specification}
                version={pendingReview.version}
              />
            )}

            {stage === "WaitingForManualActions" && blockingTasks.length > 0 && (
              <ManualActions tasks={blockingTasks} onComplete={taskId => completeTask({taskId})} projectTitle={project.title}/>
            )}

            {stage === "Completed" && (
              <LiveWorkspace change={change} changeRequests={changeRequests} onChange={setChange} onSubmit={submitChange} project={project}/>
            )}

            {!pendingReview && stage !== "WaitingForManualActions" && stage !== "Completed" && (
              <WorkingWorkspace logs={logs} projectTitle={project.title} stage={stage}/>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ProjectHeader({projectTitle, stage}: {projectTitle: string; stage: Stage}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-outline bg-white/95 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Link className="text-[#596170] hover:text-primary" href="/">Fleet</Link><ChevronRight size={14} className="text-[#8a919d]"/>
        <strong className="truncate text-ink">{projectTitle}</strong>
        <span className="ml-3 hidden rounded border border-[#b9d5fb] bg-[#edf5ff] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary sm:inline">{STAGE_LABELS[stage]}</span>
      </div>
      <div className="flex items-center gap-1 text-[#283140]"><button aria-label="Search" className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]" type="button"><Search size={19}/></button><button aria-label="Help" className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3] max-sm:hidden" type="button"><CircleHelp size={19}/></button><button aria-label="Account" className="grid size-8 place-items-center rounded hover:bg-[#f0f1f3]" type="button"><UserCircle size={20}/></button></div>
    </header>
  );
}

function LifecycleRail({lastError, onToggleTechnical, showTechnical, stage}: {lastError?: string; onToggleTechnical: () => void; showTechnical: boolean; stage: Stage}) {
  const current = STAGES.indexOf(stage);
  const steps = [
    {label: "Site plan", stageIndex: STAGES.indexOf("WaitingForSpecificationApproval")},
    {label: "Visual design", stageIndex: STAGES.indexOf("WaitingForDesignApproval")},
    {label: "Wix setup", stageIndex: STAGES.indexOf("ProvisioningWix")},
    {label: "Site build", stageIndex: STAGES.indexOf("GeneratingCode")},
    {label: "Final review", stageIndex: STAGES.indexOf("WaitingForFinalApproval")},
    {label: "Site published", stageIndex: STAGES.indexOf("Completed")},
  ];
  return (
    <aside className="hidden w-64 shrink-0 border-r border-outline bg-[#f3f4f5] px-5 py-6 lg:block">
      <h2 className="mb-6 text-[11px] font-bold uppercase tracking-[0.1em] text-[#596170]">Project progression</h2>
      <div className="relative">
        <div className="absolute bottom-3 left-3 top-3 w-px bg-[#c2c6d6]"/>
        <ol className="relative space-y-7">
          {steps.map((step, index) => {
            const nextIndex = steps[index + 1]?.stageIndex ?? STAGES.length;
            const active = current >= step.stageIndex && current < nextIndex;
            const complete = current >= nextIndex || stage === "Completed";
            return <li className="flex items-start gap-3" key={step.label}><span className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-white ${complete ? "border-primary bg-primary" : active ? "border-primary bg-primary ring-4 ring-[#d8e2ff]" : "border-[#c2c6d6] bg-[#f3f4f5]"}`}>{complete ? <Check size={13}/> : active ? <LoaderCircle className={isWaitingStage(stage) ? "" : "animate-spin"} size={13}/> : <i className="size-2 rounded-full bg-[#c2c6d6]"/>}</span><div><p className={`text-xs font-semibold ${active ? "text-primary" : complete ? "text-ink" : "text-[#858c98]"}`}>{step.label}</p><p className="mt-0.5 text-[11px] text-[#737b88]">{active ? isWaitingStage(stage) ? "Awaiting your input" : "In progress" : complete ? "Complete" : "Queued"}</p>{active && lastError && <button className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#a82922]" onClick={onToggleTechnical} type="button"><CircleAlert size={12}/>Failure details <ChevronDown className={showTechnical ? "rotate-180" : ""} size={12}/></button>}{active && lastError && showTechnical && <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-[#2e3132] p-2 text-[10px] leading-4 text-white">{lastError}</pre>}</div></li>;
          })}
        </ol>
      </div>
    </aside>
  );
}

function ReviewWorkspace({artifactType, comment, onApprove, onCommentChange, onRequestChanges, project, specification, version}: {artifactType: string; comment: string; onApprove: () => void; onCommentChange: (value: string) => void; onRequestChanges: () => void; project: {title: string; wix?: {previewUrl?: string}}; specification?: Specification; version: number}) {
  const title = artifactType === "specification" ? "Site Plan Summary" : artifactType === "design" ? "Review your design" : "Review your site";
  const approveLabel = artifactType === "specification" ? "Approve Site Plan" : artifactType === "design" ? "Approve Design" : "Approve Site";
  return (
    <div className="space-y-5">
      <section className="rounded border border-outline bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">Ready for review · Version {version}</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-5 text-[#596170]">Check the work below against the client brief. Approve it to continue automatically, or leave one clear change request.</p></div><span className="hidden size-10 place-items-center rounded-full bg-[#edf5ff] text-primary sm:grid"><Check size={20}/></span></div>
      </section>
      {specification ? <SpecificationSummary spec={specification}/> : <VisualReview artifactType={artifactType} previewUrl={project.wix?.previewUrl} projectTitle={project.title}/>}
      <section className="rounded border border-outline bg-[#f1f2f4] p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquareText size={18} className="text-primary"/>Review feedback</div>
        <textarea className="min-h-24 w-full resize-y rounded border border-outline bg-white p-3 text-sm outline-none placeholder:text-[#717987] focus:border-primary focus:ring-2 focus:ring-[#d8e2ff]" onChange={event => onCommentChange(event.target.value)} placeholder="Describe exactly what should change…" value={comment}/>
        <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row"><button className="min-h-10 rounded border border-[#727785] bg-white px-5 text-xs font-semibold tracking-[0.04em] hover:bg-[#f5f6f7] disabled:opacity-40" disabled={!comment.trim()} onClick={onRequestChanges} type="button">Request changes</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-primary px-6 text-xs font-semibold tracking-[0.04em] text-white hover:bg-[#064aa0]" onClick={onApprove} type="button"><Check size={16}/>{approveLabel}</button></div>
      </section>
    </div>
  );
}

function VisualReview({artifactType, previewUrl, projectTitle}: {artifactType: string; previewUrl?: string; projectTitle: string}) {
  return <section className="overflow-hidden rounded border border-outline bg-white"><div className="flex items-center justify-between border-b border-outline bg-[#f1f2f4] px-5 py-3"><div><h2 className="text-sm font-semibold">{projectTitle}</h2><p className="mt-0.5 text-[11px] text-[#697181]">{artifactType === "design" ? "Visual direction and page layouts" : "Latest working preview"}</p></div><Monitor size={19} className="text-[#596170]"/></div>{previewUrl ? <div className="p-5"><a className="flex min-h-72 items-center justify-center rounded border border-outline bg-[#edf0f3] text-sm font-semibold text-primary hover:bg-[#e3e8ef]" href={previewUrl} rel="noreferrer" target="_blank">Open visual preview <ExternalLink className="ml-2" size={16}/></a></div> : <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><div className="grid size-14 place-items-center rounded-full bg-[#edf5ff] text-primary"><Monitor size={25}/></div><div><p className="font-semibold">Review package ready</p><p className="mt-1 max-w-md text-sm text-[#697181]">The visual output is attached to this project version. A browser preview will appear here when Wix provisioning supplies its verified URL.</p></div></div>}</section>;
}

function ManualActions({onComplete, projectTitle, tasks}: {onComplete: (taskId: Id<"manualTasks">) => void; projectTitle: string; tasks: Array<{_id: Id<"manualTasks">; title: string; description: string; blocking: boolean; wixDashboardUrl?: string}>}) {
  const required = tasks.filter(task => task.blocking); const optional = tasks.filter(task => !task.blocking);
  return <div><span className="inline-flex items-center gap-2 rounded bg-[#ffdad6] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#93000a]"><CircleAlert size={14}/>Action required</span><h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">A few things need you</h1><p className="mt-1 text-sm text-[#596170]">{projectTitle} will continue automatically when the required Wix tasks are done.</p><div className="mt-6 rounded border-l-4 border-primary bg-[#e7e8e9] px-5 py-4 text-sm">The site build is safely paused. Complete these in Wix, then mark them done here.</div><TaskGroup label="Required tasks" onComplete={onComplete} tasks={required}/>{optional.length > 0 && <TaskGroup label="Optional optimizations" onComplete={onComplete} tasks={optional}/>}</div>;
}

function TaskGroup({label, onComplete, tasks}: {label: string; onComplete: (taskId: Id<"manualTasks">) => void; tasks: Array<{_id: Id<"manualTasks">; title: string; description: string; wixDashboardUrl?: string}>}) {
  return <section className="mt-7"><h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#424754]">{label}</h2><div className="space-y-3">{tasks.map(task => <article className="flex items-start gap-4 rounded border border-outline bg-white p-5" key={task._id}><button aria-label={`Mark ${task.title} done`} className="mt-0.5 size-6 shrink-0 rounded border border-outline bg-white hover:border-primary hover:bg-[#edf5ff]" onClick={() => onComplete(task._id)} type="button"/><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{task.title}</h3><p className="mt-1 text-xs leading-5 text-[#596170]">{task.description}</p>{task.wixDashboardUrl && <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" href={task.wixDashboardUrl} rel="noreferrer" target="_blank">Open in Wix <ExternalLink size={13}/></a>}</div></article>)}</div></section>;
}

function LiveWorkspace({change, changeRequests, onChange, onSubmit, project}: {change: string; changeRequests: Array<{_id: string; description: string; status: string; _creationTime: number}>; onChange: (value: string) => void; onSubmit: () => void; project: {title: string; wix?: {liveUrl?: string; previewUrl?: string}}}) {
  return <div className="space-y-5"><section className="flex flex-col justify-between gap-4 rounded border border-outline bg-white p-5 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#22a75a]"/><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#17693a]">Live & active</span></div><h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{project.wix?.liveUrl ? safeHostname(project.wix.liveUrl) : project.title}</h1></div>{project.wix?.liveUrl && <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-primary px-5 text-xs font-semibold text-white hover:bg-[#064aa0]" href={project.wix.liveUrl} rel="noreferrer" target="_blank">Open live site <ExternalLink size={15}/></a>}</section><section className="overflow-hidden rounded border border-outline bg-white"><div className="flex h-11 items-center gap-2 border-b border-outline bg-[#e1e3e4] px-4"><i className="size-2.5 rounded-full bg-[#d28f8d]"/><i className="size-2.5 rounded-full bg-[#c9a979]"/><i className="size-2.5 rounded-full bg-[#82a8d4]"/><span className="mx-auto max-w-md truncate rounded border border-outline bg-white px-5 py-1 text-[10px] text-[#596170]">{project.wix?.liveUrl ?? "Live Wix site"}</span></div><div className="flex min-h-64 flex-col items-center justify-center gap-3 bg-[#f0f2f4] p-8 text-center"><Globe2 size={36} className="text-primary"/><p className="font-semibold">Your Wix site is live</p><p className="text-sm text-[#697181]">Use the verified live-site link above to view or manage it.</p></div></section><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><section className="flex min-h-80 flex-col rounded border border-outline bg-white p-5"><div className="flex items-center gap-2"><Sparkles className="text-primary" size={19}/><h2 className="text-lg font-semibold">Continuous improvement</h2></div><p className="mt-2 text-sm leading-5 text-[#596170]">Describe the next client change in plain language. It will join the project queue and rebuild against the approved site.</p><textarea className="mt-5 min-h-32 w-full resize-y rounded border border-outline bg-[#f8f9fa] p-3 text-sm outline-none placeholder:text-[#737b88] focus:border-primary focus:ring-2 focus:ring-[#d8e2ff]" onChange={event => onChange(event.target.value)} placeholder="e.g. Update the summer menu and make the hero image warmer…" value={change}/><div className="mt-auto flex justify-end pt-5"><button className="inline-flex min-h-10 items-center gap-2 rounded bg-primary px-5 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-40" disabled={!change.trim()} onClick={onSubmit} type="button"><Send size={15}/>Request change</button></div></section><section className="rounded border border-outline bg-[#f3f4f5] p-4"><h2 className="text-sm font-semibold">Change history</h2><div className="mt-3 space-y-2">{changeRequests.length === 0 ? <p className="py-8 text-center text-xs text-[#737b88]">No changes requested yet.</p> : changeRequests.slice().reverse().slice(0, 4).map(item => <article className="rounded border border-outline bg-white p-3" key={item._id}><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-4">{item.description}</p><Check size={13} className={item.status === "done" ? "text-[#22a75a]" : "text-[#d18a00]"}/></div><p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[#697181]">{item.status} · {formatDate(item._creationTime)}</p></article>)}</div></section></div></div>;
}

function WorkingWorkspace({logs, projectTitle, stage}: {logs: Array<{_id: string; message: string; level: string; _creationTime: number}>; projectTitle: string; stage: Stage}) {
  return <div className="space-y-5"><section className="rounded border border-outline bg-white p-6"><div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d8e2ff] text-primary"><Rocket className="animate-pulse" size={21}/></div><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">Working automatically</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{STAGE_LABELS[stage]}</h1><p className="mt-2 max-w-2xl text-sm leading-5 text-[#596170]">{projectTitle} is moving forward. You don’t need to do anything right now; this page will update as soon as the next review or Wix task is ready.</p></div></div></section><section className="rounded border border-outline bg-white p-5"><h2 className="text-xs font-bold uppercase tracking-[0.1em] text-[#596170]">Latest progress</h2><div className="mt-4 space-y-3">{logs.slice(0, 5).map(log => <div className="flex gap-3 text-sm" key={log._id}><span className={`mt-1.5 size-2 shrink-0 rounded-full ${log.level === "error" ? "bg-[#ba1a1a]" : "bg-primary"}`}/><div><p className="text-[#313743]">{log.message}</p><p className="mt-0.5 text-[10px] text-[#858c98]">{formatDate(log._creationTime)}</p></div></div>)}</div></section></div>;
}

function CenteredState({children}: {children: React.ReactNode}) { return <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-[#697181]">{children}</div>; }
function safeHostname(url: string) { try { return new URL(url).hostname; } catch { return "Live Wix site"; } }
function formatDate(timestamp: number) { return new Intl.DateTimeFormat(undefined, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(timestamp); }
