---
name: automations
description: Create a Wix Automation from code (an event-driven trigger → action flow the owner can see and edit in their dashboard). Read before building any "when X happens, automatically do Y" workflow.
---

# Creating automations from code

**You build the automation yourself. Do not hand this to the owner.** Creating one
through the automations API works: send the automation with an `origin` of `USER`,
a trigger identified by app id + trigger key, and at least one action. Search the
`wix-docs` skill for the current method and read its schema before calling it.

An automation wires a **trigger** to an **action**, and both must already exist —
you can't invent them. They come from apps installed on the site, so your job is to
find the right existing ones, not to create new ones.

## Firing an automation from your own backend code

Use the **custom trigger** (it appears as the Automations app's "Velo code"
trigger). Despite the name it is an ordinary catalog trigger with a normal app id
and trigger key, so the create-automation call accepts it like any other. You
generate its GUID yourself and put it in the trigger's config mapping as the hook
id; your route then fires it by that same id, passing a payload. Nothing has to be
set up in the builder first.

The same app also publishes a webhook trigger and a scheduled trigger — useful when
an inbound request or a clock, rather than your code, should start the flow.

Do **not** use the Triggered Events API (report-event / run-automation): it is
documented as not applicable to Wix Headless and callable only by apps.

## Discovering what a site actually has

- **Filter the catalog query by app id — an unfiltered query returns nothing.** An
  empty result is usually the wrong query, not an empty site.
- **Copy the shape from an existing automation.** Querying the site's automations
  shows real, working trigger and action configurations, which are a far better
  reference than assembling one from docs.
- **Don't assume a trigger exists because it sounds like it should.** There is no
  "collection item created" trigger — the CMS app publishes only a quota-related
  one. Verify before designing around one.

## Use validation as your feedback loop

The validate method checks a config **without creating anything**, and returns
precise, field-level errors. Validate, read the missing field keys, fill them,
validate again. This is faster than guessing and it is how you prove whether
something is genuinely impossible rather than merely unfamiliar.

Mind the severity: a variable that isn't in the trigger's declared payload schema
is reported as a **WARNING**, not an error. Custom triggers you create from code
have no declared schema, so those warnings are expected and harmless — the values
arrive at runtime in the payload you send. Only `CRITICAL` errors block creation.

## Emailing a *visitor* from an automation

Two different email actions exist and the difference decides everything:

- The **owner-notification** action takes an inline subject and message, but its
  recipient must be a **static, literal address** — a variable expression is
  rejected. Use it to notify the business, never to email a visitor.
- The **send-an-email** action *can* target a dynamic contact from the trigger
  payload, which is what emailing a visitor needs — but it must reference a
  pre-authored **triggered-email template** (by message id and notification topic
  id), and no API creates that template.

So if the site already has a suitable template, read its ids off an existing
automation and reuse them, then build everything else yourself. If it has none,
authoring that template is the one genuinely manual step — everything around it
(the automation, the trigger and its hook id, the payload mapping, firing it from
code) is still yours.

## When something truly can't be done from code

Only after validation or the docs have *confirmed* there is no programmatic path,
report a manual task — and scope it to **only** the impossible part, doing
everything else yourself. Give a relative `dashboardPath` (e.g. `"automations"`)
so the owner lands on the right page; never write a full URL, the factory scopes
it to the real site.
