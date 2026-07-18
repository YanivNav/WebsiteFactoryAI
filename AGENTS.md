# AGENTS.md

Read [PLAN.md](PLAN.md) before doing anything. It is the contract.

This file is about **the factory**, not about the websites the factory generates.
(Each generated site gets its own `AGENTS.md` inside its own workspace.)

## What this is

A web app that turns a plain-language brief into a live Wix Headless website,
pausing whenever a human is needed and resuming afterwards.

## The two invariants

**1. This is a Project, not a pipeline.** A project has a current stage, artifacts,
approvals, logs, and manual tasks. The worker only _advances_ it. There is no
workflow engine and we do not need one — persisted state in Convex _is_ the engine.

**2. The user is a Wix professional, not a software engineer.** This is an **internal
tool**: the users are Wix website builders who build sites for clients, all day, for a
living. Wix vocabulary — Stores, Bookings, CMS collections, the dashboard — is native to
them and is NOT jargon. Software-engineering vocabulary is: they do not read code, and
they never want to see a stack trace.

They are **experts under time pressure, juggling several client projects at once.** So:
be dense and fast, not spacious and hand-holding. Never patronise them. But never make
them debug an Astro type error either — the point of this tool is throughput.

_(V2 may sell this to actual business owners, who genuinely cannot read anything
technical. `settings.mode` already encodes both audiences: `developer` is today's
internal user, `simple` is the future product. Keep `STAGE_LABELS` and the plain-language
layer alive for that — just don't design for it now.)_

## Rules that are load-bearing

- **`Waiting*` stages are not runnable.** The worker only leases work stages. An
  approval flips the stage; the worker picks it up next tick. **Never write
  pause/resume code** — human-in-the-loop already falls out of the data model, and
  adding a second mechanism would break the first.

- **Every stage reads explicit inputs.** A generation request captures the artifact
  IDs the stage consumes. No hidden conversational context and no "what the last
  prompt said."

- **Artifacts are append-only.** Never overwrite. A rejected specification produces
  `v2`; it does not mutate `v1`.

- **Convex holds the project inputs; GitHub holds the code truth.** A lost local workspace
  is a lost _cache_ — clone the private organization repository, then resume from the
  approved specification and design. Human code edits may exist only in GitHub and must
  never be overwritten by regeneration.

- **Never mix service logic.** Wix logic does not go in Codex files. Prompts do not
  go in `services/wix/`. Each service sits behind its own interface
  (`SpecGenerator`, `DesignGenerator`, `CodeGenerator`, `Publisher`) so any of them
  can be swapped without touching anything else.

- **Prompts are files, never string literals.** `packages/prompts/*.md`. They are
  inputs, so they get hashed.

- **Do not introduce deprecated APIs.** Check the installed version's current official
  documentation before adding or upgrading an SDK integration, and migrate existing
  deprecated calls when encountered.

- **Only `Workspace` touches the filesystem.** No stage handler may import `fs` or
  spawn a process directly. This is what keeps "laptop" and "container" the same code.

- **Codex is never told "build my website".** It gets the specification, the design,
  the repository, `AGENTS.md`, and _one scoped task_.

## Consequences of who the user is

- **Review gates are visual.** A Wix builder judges a rendered site — that is literally
  their craft. They do not review diffs. `WaitingForCodeReview` only exists in
  `developer` mode.
- **The AI fixes its own build failures.** `RunningChecks` self-heals before escalating.
  Not because the user is incapable, but because making a designer debug a TypeScript
  error is precisely the waste this tool exists to remove. This is core, not polish.
- **But surface the failure detail when it matters.** A professional whose build failed
  three times wants to know _what_ broke. Do not hide it — put it **on the step that
  failed**, one click away. A global log or a global "technical details" dump is clutter;
  per-step detail on demand is respect.
- **Manual tasks deep-link into the Wix dashboard** they already know. The value is
  landing them on the exact page — not explaining what the page is. Never "run this
  command".

- **NEVER fabricate a user-facing URL.** If you do not _know_ the link is real, ship
  no link. This rule exists because it was already broken once: a plausible-looking
  `manage.wix.com/premium-purchase-plan` was invented and 404'd. For a user who cannot
  read code, a confident link to a dead page is unrecoverable — it is the exact failure
  this product exists to prevent, and it is worse than an absent link.
  Wix dashboard pages are **site-scoped** (`manage.wix.com/dashboard/{metaSiteId}/…`),
  so these URLs must be _derived_ from the site ID that provisioning returns — they
  cannot be hardcoded, and cannot exist before Phase 5. Verify every path against a
  live site before shipping it. The same goes for any other outward-facing URL.
- **No ENGINEERING jargon in the UI.** Never "artifact", "repository", "commit",
  "deploy", "schema", or "stage". Wix vocabulary (Stores, Bookings, CMS collections) is
  fine and expected — these people speak it fluently. `STAGE_LABELS` in
  `@factory/shared` is the only place internal names become human words.

## Convex guardrails

Convex was chosen for two things: **live-updating queries** (the user watches their
site get built — that feeling _is_ the product) and **serializable mutations** (the
atomic lease is correct in ~15 lines). Both of those come with sharp edges. Respect
these or you will hit them.

- **Never hot-write the `projects` document.** Convex uses optimistic concurrency:
  frequent writes to the same doc from the worker _while_ the dashboard also writes
  produce OCC retries and, under load, failures. So:
  - log output → **`logs`, as separate append-only documents** (no contention, no
    shared row to fight over);
  - live progress the UI renders → **its own table, one small document per unit of
    work** (`designProgress` is the pattern: one row per screen, patched through
    queued → generating → ready). Same OCC properties as `logs`, but it is *state*;
  - the `projects` doc is written **only on a real stage transition**.

- **Logs are narration, never state.** No reader may branch on a log's message or
  `data` to reconstruct what the pipeline is doing — that was tried, it produced
  regex-parsing of human-readable messages in the UI, and it is banned. If the
  dashboard needs to know something, give it a table (see `designProgress`) or a
  field. The same goes for stuffing JSON into string fields: structured data gets a
  typed shape (`ReviewFeedback` in `@factory/shared`), never `JSON.stringify` into a
  `string[]`.

- **Blobs never go inside documents.** Stitch HTML, screenshots, raw build output →
  Convex file storage, keep the `storageId`. Documents hold references, not payloads.

## Staying portable (Convex → Neon + Trigger.dev)

We may move to Postgres + Trigger.dev later — most plausibly at Phase 5, when the
worker containerizes and Trigger.dev could become the executor outright. That is a
cheap move _only if_ these hold. They are not optional.

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

## Collaboration uses both the queue and GitHub

In-app change requests remain a serialized queue: the worker lease guarantees only one
factory writer per project. In Phase 5 every project also gets a private repository in
the configured GitHub organization so its exact code is backed up and developers can
work from multiple computers.

The factory owns direct writes to the default branch. Human development uses branches
and pull requests. Before filesystem stages, the worker fetches and fast-forwards; after
successful factory commits it pushes without force. A remote race causes a clean sync
and deterministic rerun, never a force-push or invented merge resolution.

After launch, the factory remains the operational control plane even when editing happens
elsewhere. Codex, Claude, or a human may work on a branch, but the factory owns checks,
preview, visual approval, merge, and Wix release so the user never needs Git or Wix CLI.
In-app requests route to the earliest necessary stage: content/code changes can go directly
to implementation, while new pages and changed flows return through specification and
Stitch design before coding.

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
  lib/             hash.ts (provenance), prompts.ts (load + hash prompt files)
  services/        llm/ spec/ stitch/ Codex/ wix/  ← never mixed
                   llm/ resolves LLM_MODEL ("provider:model-id") via the AI SDK, so
                   swapping model is config. The service interfaces (SpecGenerator,
                   DesignGenerator, …) swap the STRATEGY; LLM_MODEL swaps the MODEL.
                   Both axes matter — do not collapse them.
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

**Phase 1 complete: the walking skeleton runs.** The state machine, the atomic lease,
approval gates, manual tasks, append-only artifact versioning, the change-request
queue, and the dashboard are all real and verified end-to-end.

**The stage handlers are FAKE** (`packages/worker/src/stages/*`). They log, pause, and
emit canned artifacts. `FAKE_WORK_MS` widens the pause so you can kill the worker
mid-stage. Phases 3–5 replace them one at a time; nothing else should need to move.

Verified, not assumed:

- A worker `kill -9`'d mid-stage leaves a stale lease; a fresh worker reclaims it after
  the TTL and **redoes the stage from scratch** — safe precisely because stages are
  deterministic from their inputs.
- The worker refuses to touch `Waiting*` stages. Approving flips the stage; the worker
  picks it up. No pause/resume code exists.
- A rejected/changed artifact produces `v2`. `v1` is never mutated.
- `Completed` → change request → `GeneratingCode` → … → `Completed`. It is a resting
  state, not a terminal one.

**Lease TTL is the crash-recovery latency.** Default 300s: a crashed worker's project
is stuck for up to 5 minutes. That is safe (a slow-but-alive worker is never robbed
mid-stage) but slow. When code generation gets long in Phase 5, the renew interval —
not the TTL — is what keeps a healthy worker's lease alive.
