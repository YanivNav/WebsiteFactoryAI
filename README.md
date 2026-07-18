# AI Website Factory

Architecture baseline for a project-based website factory.

> **Status: architecture shell.** The dashboard, timeline, Convex state, worker polling,
> atomic leasing, lease renewal, question generation, and site-plan generation are implemented.

## The idea

It is not a pipeline. **It is a Project.** A project points to current worker-owned
Work or a human-owned User Task. Both consume and produce immutable, versioned
artifacts. Progress and errors belong to Work rather than the project itself.

```
Draft → Planning your site → [review] → Designing your site → [review]
      → Setting up your Wix site → [action needed]
      → Building your site → Preparing your preview → [review]
      → Publishing → Live ⟲ (ask for changes in plain English)
```

The worker leases only queued Work. A User Task owns its persisted `onComplete` action.
Completing it supplies the result artifact and atomically performs that action.
Operation input contracts are declared once in `WORK_DEFINITIONS`; Convex stores and
validates the generic instruction protocol without knowing individual operations.

## Architecture

```
        Next.js dashboard  ← never touches a repo or a filesystem
                │
             Convex        ← the only source of truth (state + work queue)
                │
        Background worker  ← polls and leases queued Work
```

The worker **pulls** work from Convex, so it needs no inbound address — no webhook, no
tunnel, no open port. That is why the dashboard can sit on Vercel while the worker runs
on a laptop today and in a container tomorrow, with no business logic changing.

## Setup

Requires **Node ≥ 20.11** and **pnpm**.

```bash
pnpm install
cp .env.example .env.local     # no keys needed to boot
```

### Run

```bash
pnpm convex     # Convex dev server — writes CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL
pnpm dev        # dashboard → http://localhost:3000
pnpm worker     # background worker
```

Add integrations as worker operations behind their service interfaces.

## Who this is for

Wix-literate business people who **cannot read code**. They know Stores, Bookings, CRM,
CMS, and the Wix dashboard. That constraint shapes the product:

- The dashboard remains a realtime view over Convex.
- Waiting stages remain non-runnable and require an explicit user action.
- The worker remains the only process that leases and advances runnable work.
