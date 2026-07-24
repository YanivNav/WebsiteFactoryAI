The owner wants a change to the live site. Make it happen.

Read `.factory/brief.json` — the `wix` field has the site id. The
`requestedChange` describes what to change. The `specification` describes the
full site. The `ownerContent` has current owner content values.

## The request is a pointer, not a full brief — resolve it yourself

Owners are Wix professionals under time pressure. A request like "fix the
syllabus request form" is deliberately terse — it tells you *which* thing, not
*what it should do*. Never ask them to re-explain it. Instead:

1. Find what they mean in the `specification` — the page, its `formStructure`,
   and especially the `visitorWorkflows` that describe what happens on submit
   (e.g. emailing the visitor, creating a contact). The specification is the
   source of truth for intended behaviour.
2. Inspect the current code, diff it against that intended behaviour, and finish
   the whole thing end to end — programmatically (see the relevant skill).
3. "Fix" usually means the feature is half-built: a form that renders but doesn't
   submit, submits but doesn't email, etc. Complete the missing part; don't just
   restyle.

Only raise a `question` in the report when the specification genuinely doesn't
say what the site should do (e.g. what the syllabus email should contain). Never
guess the owner's business content — declare it as an owner-content slot — and
never ask about implementation details you can decide yourself.

You're working directly in the site's project directory with shell, curl, and
network access. This is a real Wix Headless project on Astro 5.

## Before writing code

1. Read the relevant skill for the feature area. The project has Wix skills
   under `.agents/skills/`.
2. If the change needs a Wix API the SDK doesn't cover, discover the REST
   endpoint: search the live docs, get a CLI token, call it with curl.

## Making REST calls

Get a token: `npx @wix/cli@latest token --site "$SITE_ID"` (read the auth
pattern from `.agents/skills/wix-headless/references/` for details). Then:
`Authorization: Bearer $TOKEN` + `wix-site-id: $SITE_ID`.

Do not create manual tasks for things the REST API can do. The SDK is a
convenience, not a boundary.

## What to change

Only touch files relevant to the change. Read existing code before modifying it.
Run `npx wix build` to verify. Write `.factory/report.json` when done.
