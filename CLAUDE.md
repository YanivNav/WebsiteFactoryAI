# CLAUDE.md — conventions for this repository

Read [PLAN.md](PLAN.md) before doing anything. It is the contract.

This file is about **the factory**, not about the websites the factory generates.
(Each generated site gets its own `CLAUDE.md` inside its own workspace.)

## What this is

A web app that turns a plain-language brief into a live Wix Headless website,
pausing whenever a human is needed and resuming afterwards.

## The two invariants

**1. This is a Project, not a pipeline.** A project has a current stage, artifacts,
approvals, logs, and manual tasks. The worker only *advances* it. There is no
workflow engine and we do not need one — persisted state in Convex *is* the engine.

**2. The user cannot read code.** They are Wix-literate business people: they know
Stores, Bookings, CRM, CMS, and the Wix dashboard. They know nothing about
programming. This is a hard constraint on everything user-facing.

## Rules that are load-bearing

- **`Waiting*` stages are not runnable.** The worker only leases work stages. An
  approval flips the stage; the worker picks it up next tick. **Never write
  pause/resume code** — human-in-the-loop already falls out of the data model, and
  adding a second mechanism would break the first.

- **Every stage is deterministic from its inputs.** A stage reads only what it
  explicitly resolves from Convex and the workspace. No hidden conversational
  context, no "what the last prompt said". Rerun it tomorrow with the same inputs
  and it behaves the same. Artifacts record `promptHash` + `inputsHash` so a
  violation is detectable rather than mysterious.

- **Artifacts are append-only.** Never overwrite. A rejected specification produces
  `v2`; it does not mutate `v1`.

- **Convex holds the truth; the repository is derived state.** A lost workspace is a
  lost *cache* — regenerate it from the approved specification and design.

- **Never mix service logic.** Wix logic does not go in Claude files. Prompts do not
  go in `services/wix/`. Each service sits behind its own interface
  (`SpecGenerator`, `DesignGenerator`, `CodeGenerator`, `Publisher`) so any of them
  can be swapped without touching anything else.

- **Prompts are files, never string literals.** `packages/prompts/*.md`. They are
  inputs, so they get hashed.

- **Only `Workspace` touches the filesystem.** No stage handler may import `fs` or
  spawn a process directly. This is what keeps "laptop" and "container" the same code.

- **Claude is never told "build my website".** It gets the specification, the design,
  the repository, `CLAUDE.md`, and *one scoped task*.

## Consequences of "the user cannot read code"

- **Review gates are visual.** A merchant cannot approve a diff; they can judge a
  rendered preview. `WaitingForCodeReview` only exists in `developer` mode.
- **The AI fixes its own build failures.** `astro check: TS2304` is unactionable for
  this user, so `RunningChecks` self-heals before escalating. A human sees "we hit a
  snag, retrying" — never a stack trace. This is core, not polish.
- **Manual tasks deep-link into the Wix dashboard** they already know. Never "run
  this command".
- **No jargon in the UI.** Never "artifact", "repository", "commit", "build", or
  "stage". `STAGE_LABELS` in `@factory/shared` is the only place internal names
  become human words.

## Convex guardrails

Convex was chosen for two things: **live-updating queries** (the user watches their
site get built — that feeling *is* the product) and **serializable mutations** (the
atomic lease is correct in ~15 lines). Both of those come with sharp edges. Respect
these or you will hit them.

- **Never hot-write the `projects` document.** Convex uses optimistic concurrency:
  frequent writes to the same doc from the worker *while* the dashboard also writes
  produce OCC retries and, under load, failures. So:
  - progress and log output → **`logs`, as separate append-only documents** (no
    contention, no shared row to fight over);
  - the `projects` doc is written **only on a real stage transition**.
  - If you ever want a progress bar, derive it from `logs`. Do not tick a counter on
    `projects`.

- **Blobs never go inside documents.** Stitch HTML, screenshots, raw build output →
  Convex file storage, keep the `storageId`. Documents hold references, not payloads.

## Staying portable (Convex → Neon + Trigger.dev)

We may move to Postgres + Trigger.dev later — most plausibly at Phase 5, when the
worker containerizes and Trigger.dev could become the executor outright. That is a
cheap move *only if* these hold. They are not optional.

- **The worker NEVER imports Convex.** All state access goes through `ProjectStore`
  (`packages/worker/src/store/`). No exceptions, not even "just this one query".
  The worker is where all the business logic lives, so it is the only place
  portability actually costs anything.

- **The dashboard MAY use Convex hooks directly.** Realtime is why we picked Convex;
  hiding it behind an abstraction would throw away the benefit. Just keep the calls
  confined to a data/hooks layer so a migration touches one directory.

- **Convex functions stay dumb.** CRUD plus the atomic lease. **Zero business logic.**
  The instant a stage decision or a gate rule leaks into a Convex mutation, the
  Postgres port stops being a mechanical translation and becomes a rewrite. Business
  logic belongs in the worker, always.

- **IDs are opaque strings at the boundary.** Never let `Id<"projects">` escape into
  `@factory/shared` or the worker's types.

The blast radius of a migration, if these hold: implement `ProjectStore` against
Postgres, rewrite the dashboard's data hooks. The state machine, the stage handlers,
and the services never notice.

## Collaboration is a queue, not git

Two people on two computers both submit change requests through the app. The
worker's lease serializes them against one canonical workspace, so **there is only
ever one writer and merge conflicts are structurally impossible.** Do not introduce
branching, pushing, or AI conflict resolution — it would solve a problem we have
deliberately arranged not to have. GitHub returns in V2 only as "Export my code".

## Layout

```
apps/web/          Next.js dashboard — never touches a repo or filesystem
convex/            state, queue, realtime feed
packages/shared/   Stage enum + labels — one definition, used by web AND worker
packages/worker/   the only thing with a filesystem
  runner/          JobRunner    (LocalRunner    → Trigger.dev in V2)   — where work runs
  workspace/       Workspace    (LocalWorkspace → RemoteWorkspace)     — where files live
  store/           ProjectStore (ConvexStore    → PostgresStore)       — where state lives
  stages/          one handler per runnable stage
  services/        openai/ stitch/ claude/ wix/  ← never mixed
packages/prompts/  versioned prompt files
workspaces/        per-project checkouts — disposable, gitignored
```

## Commands

```bash
pnpm install
pnpm convex      # Convex dev server (generates CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL)
pnpm dev         # dashboard  → http://localhost:3000
pnpm worker      # background worker
pnpm typecheck
```

## Current state

**Phase 0 complete: scaffolding only.** Every stage handler, Convex function, and
service is an empty stub. Nothing is wired up. Phase 1 is the walking skeleton —
fake stage handlers, real state machine — and its bar is: *kill the worker mid-stage,
restart it, and the project resumes correctly.* Prove that before writing a single
real integration.
