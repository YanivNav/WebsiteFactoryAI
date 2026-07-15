# AI Website Factory

Turns a plain-language brief into a live **Wix Headless** website — pausing whenever a
human is needed, and resuming seamlessly afterwards.

> **Status: Phase 0 — scaffolding.** The structure exists; nothing is implemented yet.
> See [PLAN.md](PLAN.md) for the full build plan and [CLAUDE.md](CLAUDE.md) for the
> conventions.

## The idea

It is not a pipeline. **It is a Project.** A project has a current stage, artifacts,
approvals, logs, and manual tasks. A background worker simply advances it. All progress
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
        Background worker  ← leases work; owns the filesystem
                │
   ┌────────────┼────────────┐
OpenAI    Google Stitch   Claude Agent SDK
                              │
                        Wix Headless (Astro)
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
pnpm worker     # background worker (currently idles — no stages implemented)
```

### API keys

None are required for Phase 0. Each is needed at the phase noted; see
[`.env.example`](.env.example).

| Key                                           | Needed for                                                 | Phase              |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------ |
| `OPENAI_API_KEY`                              | Specification generation                                   | 3                  |
| `STITCH_API_KEY`                              | Design generation (Google Stitch)                          | 4                  |
| `ANTHROPIC_API_KEY`                           | Code generation (Claude Agent SDK)                         | 5                  |
| `WIX_API_KEY`                                 | `wix login --api-key` — provision, build, preview, publish | 5                  |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | Dashboard ↔ Convex                                         | 1 (auto-generated) |

`GITHUB_TOKEN` is deliberately absent. GitHub is not in the critical path — the Wix CLI
runs `git init` locally and `wix release` deploys from the local checkout.

## Who this is for

Wix-literate business people who **cannot read code**. They know Stores, Bookings, CRM,
CMS, and the Wix dashboard. That constraint shapes the product:

- Review gates are **visual** — you approve a rendered preview, never a diff.
- Build failures **never reach the user**; the AI repairs its own mistakes first.
- Manual tasks **deep-link into the Wix dashboard** they already know.
- Collaboration is a **queue**, not git. Two people submit change requests; the
  worker serializes them. No branches, no pushes, no merge conflicts — ever.
