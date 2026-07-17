# AI Website Factory

Architecture baseline for a project-based website factory.

> **Status: architecture shell.** The dashboard, timeline, Convex state, worker polling,
> atomic leasing, lease renewal, and crash recovery are implemented. Every actual website
> generation step is intentionally a placeholder.

## The idea

It is not a pipeline. **It is a Project.** A project has a current stage, artifacts,
logs, and a current stage. A background worker simply advances it. All progress
lives in Convex, never in memory, so the system survives refreshes, restarts, and
interruptions.

```
Draft → Planning your site → [review] → Designing your site → [review]
      → Setting up your Wix site → [action needed]
      → Building your site → Preparing your preview → [review]
      → Publishing → Live ⟲ (ask for changes in plain English)
```

The trick that makes human-in-the-loop free: **`Waiting*` stages are not runnable.**
The worker only leases projects in a _work_ stage. Approving something flips the stage,
and the worker picks it up on its next tick. There is no pause/resume code anywhere.

## Architecture

```
        Next.js dashboard  ← never touches a repo or a filesystem
                │
             Convex        ← the only source of truth (state + work queue)
                │
        Background worker  ← polls, leases, advances one stage
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
pnpm worker     # background worker; stages use a short placeholder handler
```

No provider, Wix, GitHub, design, or browser-testing keys are used on this branch.
Add integrations back one stage at a time behind the worker's stage-handler boundary.

## Who this is for

Wix-literate business people who **cannot read code**. They know Stores, Bookings, CRM,
CMS, and the Wix dashboard. That constraint shapes the product:

- The dashboard remains a realtime view over Convex.
- Waiting stages remain non-runnable and require an explicit user action.
- The worker remains the only process that leases and advances runnable work.
