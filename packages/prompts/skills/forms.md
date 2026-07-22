---
name: forms
description: Implement a form end-to-end — validation, submission, and what happens with the data. Read before building any form or contact/signup section.
---

# Forms

A form must actually work — not just render. Implement the full round trip in code.

## The flow

1. **Render** the fields from the spec's `formStructure` (types, options; dynamic
   options come from a collection — see the `cms-data` skill).
2. **Validate** on submit (required fields, email/phone format), showing inline errors.
3. **Act on the data** in an Astro API route / server action using the SDK, per the
   spec's workflow steps:
   - Persist it: create a CMS item and/or create a CRM contact (and actually **use**
     the contact you create — e.g. as an email recipient; no orphan contacts).
   - If the workflow sends an email, do it here (see the `emailing-visitors` skill).
4. **Show a real success and error state** — never a dead submit.

## wix-forms vs custom

`formStructure.type === "custom"` → build the form and submission yourself (the common
case; needed for dynamic values or custom submit actions). `"wix-forms"` → use the Wix
Forms SDK. When in doubt, a custom form wired to CMS/CRM is the more capable choice.

## Rules

- Permissions and secrets for your own backend code are your job to wire — do not ask
  the owner about them.
- Never leave a form that posts nowhere or references config nothing sets.
