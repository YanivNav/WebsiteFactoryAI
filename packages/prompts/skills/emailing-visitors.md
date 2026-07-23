---
name: emailing-visitors
description: Send an email to a visitor/contact (confirmations, "send the syllabus", receipts). Read before implementing any send-email-after-an-action workflow.
---

# Emailing a visitor

Triggered emails are sent by a **Wix Automation**, not from your code directly.
The pattern:

1. Create or update the CRM **contact** for the visitor (name, email, …) using
   the regular SDK (`@wix/crm`, `auth.elevate`).
2. Save the event into a CMS collection (the request details, submitted form
   data, …).
3. Create the **Automation** that fires on new items in that collection and
   sends the triggered email — via the Wix Automations REST API (discover it
   fresh each build, below).

## Why not `@wix/site-crm`

`@wix/site-crm` (`triggeredEmails.emailContact`) is a **Velo host module** —
it needs a Wix platform runtime channel and does not work in Headless API
routes. `auth.elevate()` only wraps REST modules; it cannot provide the
platform channel a host module needs. Calling it throws either `Cannot read
properties of undefined (reading 'invoke')` (no channel) or `Wix context is
not available` (no platform runtime).

**Never import `@wix/site-crm` or any `@wix/site-*` package in a Headless
project.** They are Velo host modules that cannot work here.

## The Automations REST API (discover it — don't hardcode)

The Wix Automations REST API lets you create automations programmatically.
The agent discovers the current endpoint, app IDs, and trigger/action keys at
build time — never from memory.

### Discovery workflow

1. **Search for the API.** Use the `wix-docs` skill to search for the
   Automations REST endpoint:
   - Semantic search: `"create automation"` with `document_type: "REST"`
   - Or browse from `https://dev.wix.com/docs/api-reference.md` looking for
     the automations service
   - Read the method page that matches (likely `POST …/v2/automations` or
     similar) and confirm the request shape

2. **Find the app IDs.** The preinstalled Wix apps and their `appDefId`s
   are in the `wix-headless` skill's `SETUP.md` (read it from the
   project's `.agents/skills/wix-headless/references/SETUP.md`). For
   apps not listed there, curl the "Apps Created by Wix" page:
   `https://dev.wix.com/docs/api-reference/articles/work-with-wix-apis/platform/about-apps-created-by-wix.md`
   The CRM app (triggered emails) and Wix Data app (CMS collection
   triggers) are preinstalled — their IDs are discoverable.

3. **Find the trigger and action keys.** Search the docs for the specific
   building blocks you need:
   - For a "new CMS item" trigger, search `"data collection item created trigger"`
   - For the "send email" action, search `"triggered email action automation"`
   - Read the method page's schema to confirm the `triggerKey` and
     `actionKey` values, and the `inputMapping` shape

4. **Mint a token and make the call.** Follow the REST call shape from
   `wix-headless`'s `AUTHENTICATION.md` for your project type (managed:
   `npx @wix/cli@latest token --site "$SITE_ID"`):

   ```
   POST https://www.wixapis.com/automations-service/v2/automations
   Authorization: Bearer $TOKEN
   wix-site-id: $SITE_ID
   ```

### If the API works

Report the created automation in the build report (no manual task needed).

### If the API genuinely doesn't work

Only after you've searched the docs, confirmed the endpoint, and the call
fails with a non-recoverable error, fall back to a **manual task** with
`helpLink: "triggeredEmails"` telling the owner to create the Automation
in the dashboard. But this is the last resort — try the REST API first.

## Rules

- **Never import `@wix/site-crm`** in a Headless project — it's a platform
  host module that can't work here.
- One contact, used as the recipient — no orphan contacts.
- Emails only send to contacts whose subscription status is subscribed or
  not-set.
- Discover the Automations endpoint, app IDs, and trigger/action keys at
  build time — never hardcode them from a previous build.
