# AI Website Factory — V1 Build Plan

## Context

Goal: a web application that turns a natural-language brief into a production Wix Headless website, pausing whenever human review or manual intervention is required, then continuing seamlessly after approval.

Two principles drive everything below.

**1. This is not a pipeline, it is a Project.** A project has a current stage, artifacts, approvals, logs, and manual tasks. The worker only advances it. No workflow engine in V1 — persisted project state *is* the workflow engine.

**2. The user cannot read code.** They are Wix-literate business people — they know Stores, Bookings, CRM, CMS, and the Wix dashboard. They know nothing about programming. This is a hard constraint on the product surface, and it *removes* work rather than adding it (see below).

---

## Verified findings (researched, load-bearing)

**Wix CLI is fully scriptable — including auth.**
- `npm create @wix/new@latest -- headless --folder-name X --business-name Y --site-template <name>` runs **non-interactively** (the docs explicitly recommend it for "automated scripts and AI agents"). It provisions the Wix business + site, installs dependencies, **runs `git init`**, builds, and publishes.
- **`wix login --api-key <token>`** — "Authenticate using an API key for automations and CI environments." No browser needed. **A cloud worker is viable.**
- `wix build` → build. `wix preview` → shareable versioned preview URL. `wix release` → publishes, returns live URL. `wix env set --key --value` → server-side env vars.
- Wix-managed headless projects are **Astro 5**; Wix's Astro integration handles auth + SEO.

**Google Stitch has a real SDK** — `@google/stitch-sdk`, auth via `STITCH_API_KEY`. Methods: `create_project`, `project.generate(prompt, deviceType)`, `screen.getHtml()`, `screen.getImage()`, `screen.variants()`. Models `GEMINI_3_PRO` / `GEMINI_3_FLASH`. Output is **HTML + a screenshot per screen** — directly consumable by code generation.

**Correction to the original stage order:** Wix provisioning must run **before** code generation. The scaffold *creates the repository*; running it afterwards would overwrite generated work. Manual actions move up next to it, since that is when login / premium / domain are actually needed.

---

## Architecture

```
                    User
                     │
                     ▼
            React / Next.js App
           (Project Dashboard)          ← never touches a repo or filesystem
                     │
                     ▼
                  Convex                 ← persistent project state + work queue
                     │
                     ▼
          Background Build Worker        ← leases work; owns the filesystem
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
    OpenAI    Google Stitch    Claude Agent SDK
                                    │
                                    ▼
                              Wix Headless
```

### Convex is the state store, NOT the worker

Convex actions have execution limits and no filesystem. Code generation needs git, `npm install`, `wix build`, and an agent loop over real files.

- **Convex** = persistent project state + work queue + realtime feed to the dashboard.
- **Worker** = a separate Node process that *leases* a runnable project, executes one stage, writes artifacts back.

**The dashboard never touches a repo or a filesystem.** It is a view over Convex. This is why "dashboard on Vercel, worker elsewhere" is not a contradiction: the worker **pulls** work from Convex and needs **no inbound network address** — no webhook, no tunnel, no open port. Nothing in the cloud ever reads the worker's disk.

### Where the worker runs

**Local (`pnpm worker`) through Phase 4; containerize at Phase 5.**

Phases 1–4 (skeleton, dashboard, spec, design) need **no filesystem at all** — they are API calls and Convex writes. So worker location is a non-decision until code generation lands. At Phase 5, deploy the *same process* to Railway/Fly with a persistent volume and `wix login --api-key`. Nothing else in the system changes.

All filesystem/shell access sits behind one interface, so this is a deploy target rather than a rewrite:

```ts
interface Workspace {
  root: string
  materialize(projectId): Promise<void>  // reuse if HEAD matches; else clone/scaffold
  exec(cmd, args): Promise<ExecResult>
  readFile / writeFile / glob
  commit(message): Promise<string>
  push(): Promise<void>                  // stub in V1
}
```

V1 → `LocalWorkspace`. V2 → `RemoteWorkspace` (container volume). Business logic never changes.

**Workspaces are warm, not re-cloned per stage.** `materialize()` reuses an existing checkout when HEAD matches; `node_modules` persists across stages and change requests. Re-cloning is the *recovery* path, not the hot path.

### What is actually durable

- **Convex holds the truth**: brief, specification, design, approvals, stage. These are the **inputs**.
- **The repo is derived state** — a function of (spec + design + config).

A lost workspace is a lost *cache*, not a lost project: regenerate it by re-running code generation from the approved spec and design. This is exactly what the artifact model is for.

**Therefore GitHub is not a foundation, it is a backup.** The Wix CLI `git init`s locally and `wix release` deploys **from the local checkout** — GitHub is not in the critical path to build or publish anything. It is cut from V1 and returns later as an **"Export to GitHub"** button for handoff.

### Collaboration without git (this deletes a feature)

Requirement: two people, two computers, working on the same project.

The **lease already serializes execution** — only one code stage runs per project at a time. So both users submit **change requests through the web app**; they land in a **queue** against one canonical workspace and are processed **sequentially**. There is only ever one writer.

**Merge conflicts are therefore impossible, and AI conflict resolution never needs to be built.** Users never see a branch, a push, or a conflict — which is correct, because they cannot read code. Collaboration is a queue, not a VCS.

### "Make changes later" is a stage, not a feature

A `ChangeRequest` ("make the hero blue, add a contact form", in plain English) puts a **Completed** project back into `GeneratingCode`, then flows through checks → preview → approval → publish → Completed.

This reuses the entire machine — worker, artifacts, versions, reviews, logs, publish. **`Completed` is a resting state, not a terminal one.** After launch, this becomes the *primary* interface: the project is a living site the user edits by asking.

### Code engine

`@anthropic-ai/claude-agent-sdk` — Claude Code's engine as a library, running **in-process inside the worker** with `cwd` set to the checkout. It does `fs` + `bash` on whatever machine the worker is on; the worker then commits. No "cloud filesystem" abstraction is required — it's just a directory. Implements the `CodeGenerator` interface.

### Why Convex — and how we leave if we want to

Convex earns its place on two things:

1. **Live-updating queries.** A non-programmer watching their site get built — the stage timeline, the activity feed, the preview appearing — *is* the product's sense of "something is happening for me." Convex gives this with no subscription plumbing, no SSE endpoint, no polling. On Postgres it would be the second-largest chunk of code in the app.
2. **Serializable mutations.** `leaseNextRunnable` is a read-then-conditional-write that must be atomic or two workers run the same stage. In Convex it is ~15 lines and provably correct.

**Two guardrails, because both strengths have sharp edges:**

- **Never hot-write the `projects` document.** Convex uses optimistic concurrency; frequent writes to one doc from worker *and* dashboard cause OCC retries. Progress and log output go to **`logs` as separate append-only docs**; `projects` is written **only on a real stage transition**. Derive progress bars from `logs` — never tick a counter on `projects`.
- **Blobs never live inside documents.** Stitch HTML, screenshots, raw build output → file storage, keep the `storageId`.

**The exit path (Convex → Neon + Trigger.dev), kept cheap by one rule:**

State is the **third port**, alongside `JobRunner` (where work runs) and `Workspace` (where files live):

```ts
interface ProjectStore { ... }   // packages/worker/src/store/
// V1 → ConvexProjectStore    V2 → PostgresProjectStore (Neon + Drizzle)
```

- **The worker never imports Convex.** All state access goes through `ProjectStore`. The worker holds all the business logic, so it is the only place portability actually costs anything.
- **The dashboard may use Convex hooks directly** — realtime is *why* we chose Convex, and abstracting it away would discard the benefit. Confine the calls to a data/hooks layer.
- **Convex functions stay dumb:** CRUD + the atomic lease, zero business logic. The moment a gate rule or stage decision leaks into a mutation, the Postgres port stops being a mechanical translation and becomes a rewrite.

Blast radius of a migration, if those hold: implement `ProjectStore` against Postgres, rewrite the dashboard's data hooks. The state machine, stage handlers, and services never notice.

**When to revisit:** Phase 5. If Trigger.dev becomes the *executor* (it runs containers with a filesystem and long-running jobs — it could host the worker outright, not just schedule it), you get retries and a dead-letter queue for free, Convex's queue role shrinks to state + realtime, and "Neon + Trigger.dev" becomes a coherent and arguably simpler stack. Not a Phase-0 decision — and the plan already puts the containerization call there.

### Other decisions

- **Publish target:** `settings.publishTarget: 'wix-managed' | 'custom'`, default `wix-managed` (Astro + `wix release`). `custom` is the escape hatch for sites needing custom auth/integrations; deferred to V2, but the `Publisher` interface exists in V1.
- **Auth:** none in V1. Single hardcoded owner; the `owner` field exists so multi-user is a swap, not a refactor.
- **Determinism:** every stage resolves inputs explicitly from Convex + workspace, and records `promptHash` + `inputsHash` on each artifact. No hidden conversational context, ever. Rerunning a stage tomorrow with the same inputs behaves the same way.
- **Services stay isolated** behind `SpecGenerator` / `DesignGenerator` / `CodeGenerator` / `Publisher`. Wix logic never leaks into Claude logic. Any one can be swapped (Gemini, Codex, Cursor) with nothing else changing.

---

## Clarifying questions (one textarea is not a brief)

**The problem.** A user types *"a tea shop called Tea Top"* and we are expected to plan a
website from it. We can't. The first prompt is almost never enough, and the gap gets
silently papered over by the AI inventing assumptions — which then propagate all the way
into the design and the code, where they are expensive to unwind. The specification stage
would rather guess than ask, and guessing is the failure.

**The fix.** Before planning, the system asks a few questions.

```
Draft
  → GeneratingQuestions          (read the brief, work out what is genuinely missing)
  → WaitingForAnswers        ⏸   "A few quick questions"
  → GeneratingSpecification      (now sees brief + answers)
```

**Why this costs almost nothing to build.** It is just another gate. `Waiting*` stages are
already non-runnable, so the pause falls out of the data model exactly like approvals and
manual tasks do. No new mechanism, no pause/resume code, no special casing.

**Four rules that make it good rather than annoying:**

1. **Gap-driven, not blind.** The model is asked what it *cannot infer* from the brief, and
   nothing else. Do not ask what the brief already answers. "Tea Top sells tea" — so never
   ask "what do you sell". A question the user already answered reads as not listening.

2. **Zero questions is a valid answer, and the stage advances straight through.** A rich brief
   is never interrupted. This is the same pattern `ProvisioningWix` already uses for manual
   tasks (no tasks → no pause), so it is consistent rather than a special case.

3. **Multiple choice by default, free text by exception.** Our user is a business person, not
   an author. Buttons and chips, phrased in Wix vocabulary they already own:

   > *Do you want to sell tea online?*  ( Yes ) ( Not yet ) ( I already sell elsewhere )
   > *Will you run workshops or tastings people book?*  ( Yes ) ( No )

   Each answer maps onto a Wix business solution — Stores, Bookings, Blog, CRM. That mapping
   is the whole point: it is how a plain-language answer becomes a concrete site capability.

4. **Cap it at ~5, and make every one earn its place.** A twenty-question interrogation is a
   worse experience than a wrong guess we can correct at the review gate.

**Determinism implication — this one is load-bearing.** The answers become a **durable input
artifact**, and `GeneratingSpecification` must resolve them explicitly, exactly like the brief.
They are then folded into `inputsHash`. Get this wrong and the answers become hidden
conversational context, which is precisely the thing the whole architecture forbids: rerun the
stage tomorrow and it must behave the same, which means the answers have to be *inputs*, not
memory.

**This supersedes part of Phase 2's guided intake wizard.** A static wizard asks every user the
same questions; this asks questions derived from *their actual brief*, which is strictly better.
So intake shrinks back to "name + describe it", and this stage does the real work. **Do not
build both.**

**Deferred:** follow-up rounds (answers prompting further questions). One round in V1. If the
answers are still thin, the specification review gate is the existing safety net — the user
rejects the plan and it regenerates. We already have that channel; use it before inventing another.

---

## Designing for a non-programmer

This is a product constraint with real architectural consequences.

**1. Review gates must be visual, never code.**
A Wix merchant cannot approve a diff. They *can* judge a rendered site. So `WaitingForCodeReview` **collapses** — the flow goes build → check → preview → **review the preview**.

Gates are a per-project policy rather than hardcoded transitions:

```ts
settings.mode: 'simple' | 'developer'   // default: simple
gatePolicy: Set<Stage>                  // which Waiting* gates are active
```

`simple` omits `WaitingForCodeReview`. `developer` enables it. The state machine consults the gate policy, so both modes share one flow.

**2. Failures must never surface raw — the AI fixes its own mistakes.**
`astro check: TS2304` is unactionable for this user. So the **self-healing loop is core Phase 5 work, not Phase 6 polish**:

```
RunningChecks fails → feed the build error back to Claude → fix → rebuild
                    → up to N attempts → only then escalate
```

Escalation shows *"We hit a snag while building your site — retrying"*, never a stack trace. Raw logs live behind a collapsed "Technical details" disclosure — for the operator, not the user.

**3. Manual tasks lean on the Wix dashboard they already know.**
Each task carries a **deep link into the exact Wix dashboard page**, plain-language steps, and a "Done" button. Never "run this command." Examples: connect a payment provider, upgrade to Premium, verify a domain.

**4. Plain language everywhere.**
Internal enums stay (engineering clarity); a presentation layer maps them:

| Internal stage | User sees |
|---|---|
| `GeneratingQuestions` | Reading your brief |
| `WaitingForAnswers` | A few quick questions |
| `GeneratingSpecification` | Planning your site |
| `WaitingForSpecificationApproval` | Review your site plan |
| `GeneratingDesign` | Designing your site |
| `WaitingForDesignApproval` | Review your design |
| `ProvisioningWix` | Setting up your Wix site |
| `WaitingForManualActions` | Action needed from you |
| `GeneratingCode` / `RunningChecks` | Building your site |
| `GeneratingPreview` | Preparing your preview |
| `WaitingForFinalApproval` | Review your site |
| `Publishing` | Publishing |
| `Completed` | Live |

No "artifact", "repository", "commit", "build", or "stage" in the UI.

**5. The specification is never shown as JSON.**
It renders as a friendly summary — pages, sections, and **Wix features in their vocabulary** (Store, Bookings, Blog, CRM, CMS). Edits are made in forms and plain language; each edit produces `Specification v2`, `v3`… under the hood.

**6. Intake is guided, not a blank textarea.**
A short wizard — what's your business, what do you need customers to do (buy / book / read / contact) — maps directly onto Wix business solutions and produces the brief.

---

## Stage machine

```
Draft
  → GeneratingQuestions                    (what can't we infer from the brief?)
  → WaitingForAnswers                  ⏸  "A few quick questions"  — skipped if none
  → GeneratingSpecification
  → WaitingForSpecificationApproval    ⏸  "Review your site plan"
  → GeneratingDesign
  → WaitingForDesignApproval           ⏸  "Review your design"
  → ProvisioningWix                        (scaffold: creates Wix site + local git repo)
  → WaitingForManualActions            ⏸  "Action needed" (deep-linked Wix dashboard tasks)
  → GeneratingCode                         (Claude implements spec + design into the Astro app)
  → [WaitingForCodeReview]             ⏸  developer mode only
  → RunningChecks                          (wix build, astro check — self-heals on failure)
  → GeneratingPreview                      (wix preview → shareable URL)
  → WaitingForFinalApproval            ⏸  "Review your site"
  → Publishing                             (wix release → live URL)
  → Completed                          ⏸  resting state
       ↳ ChangeRequest (plain English) → GeneratingCode → …
```

**The core scheduling rule, which is the whole trick:** `Waiting*` stages are **not runnable**. The worker only leases projects in a work stage. An approval mutation flips the stage to the next work stage; the worker picks it up on its next tick. Human-in-the-loop falls out of the data model for free — no pause/resume code exists anywhere.

Every stage is resumable. Every stage is independent. Each stage reads project state, performs work, stores artifacts, updates the stage. Nothing else.

---

## Data model (Convex)

```ts
projects        id, title, owner, status, currentStage, brief,
                settings { mode, publishTarget, businessName, siteTemplate, solutions[] },
                wix { projectId, siteId, liveUrl, previewUrl },
                lease { workerId, expiresAt },     // atomic — prevents double-execution
                attempts, lastError, createdAt, updatedAt

artifacts       projectId, type, version, data, storageId?, promptHash, inputsHash, createdAt
                type: brief | questions | answers | specification | design
                    | buildReport | preview | releaseReport
                // append-only, versioned, NEVER overwritten
                // `answers` is a DURABLE INPUT: GeneratingSpecification resolves it
                // explicitly and folds it into inputsHash. Answers must never become
                // hidden conversational context — that would break determinism.

reviews         projectId, artifactId, artifactType, version,
                status: waiting | approved | rejected | needs_changes,
                comments[], approvedBy, approvedAt

manualTasks     projectId, stage, title, description, wixDashboardUrl,
                blocking, completed, completedAt

changeRequests  projectId, description, status: queued|running|done|failed, createdAt
                // the collaboration queue — serialized by the lease

logs            projectId, stage, level, message, data, timestamp
                // structured; the user-facing feed is derived from these

stageRuns       projectId, stage, attempt, status, startedAt, finishedAt, error
```

Artifacts are append-only and versioned (`Specification v1, v2, v3…`). Never overwrite. Large blobs (Stitch HTML/screenshots, build reports) go to Convex file storage via `storageId`.

---

## Repository layout

```
apps/web/            Next.js dashboard (never touches a repo or filesystem)
convex/              schema.ts, projects.ts, artifacts.ts, reviews.ts,
                     manualTasks.ts, changeRequests.ts, logs.ts, worker.ts (lease/complete)
packages/shared/     Stage enum, artifact types, stage labels — one definition, used by web AND worker
packages/worker/
  src/runner/        JobRunner        (LocalRunner → Trigger.dev in V2)
  src/workspace/     Workspace        (LocalWorkspace → RemoteWorkspace in V2)
  src/stages/        one file per stage handler
  src/services/      openai/ stitch/ claude/ wix/     ← never mixed
packages/prompts/    spec.md design.md code.md fix.md ← versioned, hashed, never inlined
workspaces/          per-project checkouts (gitignored, disposable, warm-cached)
```

Prompts are never hardcoded. They live as versioned files and their content hash is recorded on every artifact they produce.

---

## Build phases

### Phase 0 — Scaffolding ✅

Directories, config, empty module stubs, and the API-key checklist. Every stage handler, Convex function, and service is an empty file or a `TODO` stub. Nothing is wired up.

**API keys needed** (documented in `.env.example`; none required to complete Phase 0):

| Key | Used by | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Spec generation (Phase 3) | platform.openai.com |
| `STITCH_API_KEY` | Design generation (Phase 4) | Stitch → Settings → API keys |
| `ANTHROPIC_API_KEY` | Code generation (Phase 5) | console.anthropic.com |
| `WIX_API_KEY` | `wix login --api-key` in the worker (Phase 5) | Wix → API Keys Manager |
| `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | Dashboard ↔ Convex | generated by `npx convex dev` |

`GITHUB_TOKEN` is deliberately **not** needed — GitHub is deferred (see V2).

**Done when:** `pnpm install` succeeds, `pnpm typecheck` passes, `pnpm dev` boots an empty dashboard, `pnpm worker` starts and idles. Zero business logic exists.

### Phase 1 — Walking skeleton ⭐ (the phase that determines whether this works)

Full stage machine end-to-end with **fake stage handlers** — each logs, emits a canned artifact, and advances.

- Convex schema + atomic lease/complete mutations
- Worker loop: `leaseNextRunnable() → dispatch(stage) → commitResult()`
- All stages registered, real approval gates, real manual tasks, gate policy honored
- Crude dashboard: create project, see stage, click Approve

**Done when:** you create a project, watch it walk every stage pausing at each gate, then **kill the worker mid-stage, restart it, and it resumes correctly.**

Prove crash-safety and resumability now, while the stages are fake and debugging is trivial. Every real integration afterwards lands in a system that already works. *Do not skip ahead to the fun OpenAI call.*

### Phase 2 — Dashboard (the non-programmer surface)

*Partially built during Phase 1: plain-language stage label, activity feed, review panel, manual-task checklist, change-request box, "Technical details" disclosure.*

Still missing: **stage timeline** (you only see the current stage, not where you are in the journey), **version history** browsing (`design v1` vs `v2` is invisible today), **preview embed**, and the **specification rendered as a friendly summary** instead of raw JSON.

Intake is **not** a wizard — it stays "name + describe it", because `GeneratingQuestions` (Phase 3) does the real elicitation, and does it better by tailoring the questions to the actual brief.

**Sequencing note:** most of what remains here renders *real artifacts*. Building it against `{"fake": true}` data would mean building the wrong UI and then rebuilding it — so this lands after Phase 3.

### Phase 3 — Clarifying questions + Specification (real)

Two stages, one integration. The questions stage is what makes the specification worth anything — without it we are planning a website from a single sentence.

- **`GeneratingQuestions`** (`QuestionGenerator`): read the brief, emit **only** what cannot be inferred from it — max ~5, multiple-choice by default, phrased in Wix vocabulary (Stores / Bookings / Blog / CRM). **Emitting zero questions is valid and skips the gate entirely**, so a rich brief is never interrupted.
- **`WaitingForAnswers`**: the user answers with buttons, not essays. Answers are stored as a durable `answers` artifact.
- **`GeneratingSpecification`** (`OpenAISpecGenerator`): resolves **brief + answers** explicitly, both folded into `inputsHash`. Produces a schema-constrained specification. Rendered as a **friendly summary in Wix vocabulary**, editable via forms → a new versioned artifact per edit.

Both stages sit behind the `SpecGenerator` / `QuestionGenerator` interfaces, so the model behind them is swappable without touching anything else.

*This subsumes Phase 2's guided intake wizard — build one, not both.*

### Phase 4 — Design (real)

`StitchDesignGenerator`: spec → Stitch project → screens. Persist HTML + screenshot per screen. Review UI is a **screen gallery**; rejection with comments regenerates → `Design v2`.

### Phase 5 — Wix + Code (the heart) — *the worker moves to a container here*

- **ProvisioningWix:** non-interactive `npm create @wix/new@latest -- headless`; capture Wix project/site IDs.
- **ManualActions:** auto-raise blocking tasks with Wix dashboard deep links. The worker will not pass a blocking incomplete task.
- **GeneratingCode:** `ClaudeCodeGenerator` (Agent SDK). Given specification + design HTML/screenshots + repository + `CLAUDE.md` + **one scoped task**. Never "build my website" — always "implement stage X."
- **RunningChecks + self-healing:** `wix build` / `astro check`; on failure, feed the error back to Claude and retry up to N times. **Users never see a stack trace.**
- **Preview:** `wix preview` → URL artifact. **Publishing:** `wix release` → live URL.
- Containerize: the same worker on Railway/Fly, persistent volume, `wix login --api-key`.

### Phase 6 — Change requests + hardening

The plain-English "make changes" interface (`Completed → ChangeRequest → GeneratingCode`), with the serialized queue enabling multi-user collaboration. Retry/backoff, dead-letter on repeated failure, cost/token telemetry per stage.

---

## Verification

- **Resumability** (Phase 1, then continuously): kill the worker mid-stage → restart → it resumes at the correct stage with no duplicate artifacts. Lease expiry prevents double-execution.
- **Determinism:** rerun a stage with identical inputs → identical `inputsHash` / `promptHash`. Divergence means hidden state leaked in.
- **Self-healing:** deliberately inject a broken component → confirm Claude repairs it and the user never sees the error.
- **Non-programmer walkthrough:** run someone Wix-literate but non-technical through the entire flow. If they hit a word they don't understand, that's a bug.
- **End-to-end:** one real brief ("portfolio site for a ceramics studio") → all stages → **a live Wix URL**. This is the V1 definition of done.

The application must survive refreshes, restarts, and interruptions, because all progress lives in Convex and never in memory.

---

## V1 definition of done

A user can:

1. Create a project.
2. Enter a website brief.
3. Answer a few clarifying questions the system asks about that brief.
4. Generate a structured specification.
5. Review and edit it.
6. Generate a UI design.
7. Review it.
8. Generate a Wix Headless application.
9. Review the generated preview.
10. Complete any required manual Wix tasks.
11. Publish the finished website.
12. Ask for changes in plain English, and have them applied.

---

## Explicitly deferred to V2

Trigger.dev execution layer (`JobRunner` swap) · auth / multi-tenancy · `custom` publish target · **"Export to GitHub"** (handoff only — *not* collaboration) · alternative generators (Gemini / Codex / Cursor) · plugin system.

Each is already an interface in V1. None require touching business logic.
