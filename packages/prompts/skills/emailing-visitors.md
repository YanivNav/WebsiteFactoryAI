---
name: emailing-visitors
description: Send an email to a visitor/contact (confirmations, "send the syllabus", receipts, notifications). Read before implementing any send-email-after-an-action workflow.
---

# Emailing a visitor

Sending email to a visitor or contact is a **solved, programmatic capability** in
Wix. Never hand this back to the owner as a manual task, and never conclude "there
is no API" — there is. Your job is to discover the current one and call it.

`@wix/site-*` packages are Velo host modules and do **not** work in Headless.
Never import them. Everything below is done from backend code via REST.

## Find the right API (don't assume — search)

Wix's APIs change, so discover the current shape with the `wix-docs` skill instead
of trusting memory. There are two families to search for, in order of preference:

1. **Direct send** — a one-off email straight to a contact/email address when an
   action happens (the confirmation/receipt/"send X" case). Search the docs for
   terms like *send email to contact*, *transactional email*, *email transmission*.
   This is usually the right tool: you call it inline from your backend route when
   the visitor does the thing, no dashboard setup required.
2. **Automations** — a trigger your code fires, whose action sends the mail. See
   the `automations` skill; you create the automation yourself. Heavier than a
   direct send, but it goes through Wix's triggered-email pipeline, which is a
   **different delivery path**. That matters: if direct sends report success yet
   never arrive, this route is the alternative worth trying — the problem is the
   pipeline, not your code.

For whichever you pick, read the method schema before calling it — confirm the
endpoint, required fields (sender identity, recipient, subject, HTML body), and
whether the sender address must be verified first (search *sender details* /
*verify sender* if the send is rejected).

## A successful send call is NOT a delivered email

A send that returns `ACCEPTED` only means *queued*. The real outcome (processed
or rejected) appears afterwards, so never treat the call returning as proof the
email arrived — and never report success on that basis.

To find out what actually happened, look the transmission up by its id after
sending. Its status moves on to *processed* — where each recipient carries its
own failure reason (address missing, invalid, previously bounced, consent not
given…) — or *rejected*, where the rejection reasons say why. That per-recipient
reason is the real answer when mail doesn't arrive; search the docs for the
current method rather than assuming.

A sender address is **optional**: omit it and Wix sends from its own default
address. If you do pass one it must be verified, or the send is refused. Verifying
an address needs a code emailed to that inbox, so that is a genuine manual task
for the owner — never invent a sender address the site can't actually send from.

Sending and *arriving* are different problems. A site with no custom domain can
still send — Wix falls back to its own default from-address — so never tell the
owner they need a domain to send email. When the owner says "the email never
arrived", check the transmission first. **If it reports success, the code is
working**: the problem is deliverability (spam filtering, sender/domain
reputation) or the platform itself, and none of that is fixed by rewriting the
route. Report what the transmission actually says instead of rebuilding code
that is already correct.

## Making REST calls

- Get a site-scoped token: `npx @wix/cli@latest token --site "$SITE_ID"`.
- Use `Authorization: Bearer $TOKEN` + `wix-site-id: $SITE_ID` headers.
- Read `.agents/skills/wix-headless/references/` for the full auth pattern.

## Rules

- Never import any `@wix/site-*` package.
- Email only contacts whose subscription status is subscribed or not-set.
- Only report a manual task after you've searched the docs and confirmed no
  programmatic path exists — which, for sending email, should not happen.
