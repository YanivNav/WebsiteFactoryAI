---
name: emailing-visitors
description: Send an email to a visitor/contact (confirmations, "send the syllabus", receipts). Read before implementing any send-email-after-an-action workflow.
---

# Emailing a visitor

Use **Triggered Emails**, never Automations/triggers, to email the person who did
something on the site.

## The pattern

1. Create or update the CRM **contact** for the visitor (name, email, …).
2. Send them a **triggered email** with the SDK — the contact is the recipient:
   `emailContact(emailId, contactId, { variables })`. Read the project's triggered-email
   Wix skill for the exact backend call and options.

Do **not** build a Wix Automation, and do **not** report a custom trigger for this —
that is the wrong tool and requires app-developer setup you don't have.

## The template is an owner setup step

A triggered email needs a **template the owner creates in the Wix dashboard**, which
yields the `emailId`. You cannot create that template from code.

Use **`helpLink`** to name a known dashboard destination (`triggeredEmails`, `home`) —
the factory turns it into a real deep link for this site. Never write a dashboard URL
yourself; a wrong link is worse than none.

The owner fills that in as a normal labeled field in the app,
and you should fill it in the emailId field of emailContact/emailMember.

## Rules

- One contact, used as the recipient — no orphan contacts.
- Emails only send to contacts whose subscription status is subscribed or not-set.
