You are implementing one scoped change in an existing Wix-managed Headless Astro project.

The factory deliberately gives you one implementation unit at a time. Stay inside that unit. Work
already completed by earlier units has been built and checkpointed; preserve it. Do not preemptively
implement later routes or workflows unless the current unit requires a small shared dependency.
Before finishing, inspect the unit's acceptance criteria, run the narrowest useful local check, and
repair anything the unit broke. The factory will run an independent Wix build before accepting it.

Work directly in the repository. Read its AGENTS.md first and follow it. Use the approved
specification and the Stitch HTML/screenshots in `.factory/context/` as implementation inputs,
not as files to serve directly. Recreate the design as maintainable Astro components and CSS.

Preserve Wix's generated configuration, authentication integration, scripts, and project
structure. Use the Wix SDK and installed business-solution packages where the specification
requires them. Never replace real Wix functionality with mock data when the scaffold already
provides an integration pattern.

Treat `.factory/context/site.json#wixSolutionArchitecture` as the implementation architecture for
every visitor journey. Its frontend responsibilities, backend responsibilities, ordered data flow,
configuration, and acceptance tests are binding. The implementation-neutral business requirements
explain why it exists, and the capability snapshot records the Wix evidence behind it. Do not
reselect a Wix product from the visual appearance of a control.

The factory has already created the CMS collections listed in
`.factory/context/site.json#wixResources.cmsCollections`. Query every required collection with
the current `@wix/data` Items API using `auth.elevate(items.query)` from `@wix/essentials`. Collection IDs
must come from the verified resource map. Never create local fixture arrays for CMS-backed data;
render a useful empty state when a collection has no items.

The factory has imported externally hosted Stitch images into Wix Media. Replace every source URL
using `.factory/context/site.json#wixResources.media`. Never ship `googleusercontent.com` URLs or
other Stitch asset URLs in source code.

Treat every visible control as a functional requirement, not decoration. Search, filters, dialogs,
forms, pagination, carts, booking actions, and other interactions must work end to end. Implement
`specification.infrastructure.visitorWorkflows` according to their ordered actions and dynamic
context. Do not assume custom inputs require Wix Forms. Use `@wix/forms` only for
`saveFormSubmission`; use Wix CRM `appendOrCreateContact` for `createOrUpdateContact`, then pass the
returned contact ID and page-derived variables to the configured triggered email for
`sendTriggeredEmail`. Never hardcode the current course or syllabus URL. Show submitting, success,
validation, and failure states. An inert button, plain form without a handler,
or custom `data-*` attribute is not an implementation.
Follow each journey's `browserTest` contract. For `interaction`, put
`data-factory-workflow="<workflow id>"` on the actual enclosing form or clickable primary action;
for `content`, put it on the visible content region. Put `data-factory-state="success"` on an
interaction's visible success state. Client-hydrated forms should expose
`data-factory-ready="true"` after their submit handler is attached. A journey whose browser test is
`none` is staff/dashboard/system work: do not add its marker, controls, or Wix dashboard links to
the public website. Never add a public control merely to satisfy QA.
Visitor contact capture runs in a server endpoint. Import `submittedContact` from `@wix/crm`, import
`auth` from `@wix/essentials`, and elevate the operation once:
`const appendOrCreateContact = auth.elevate(submittedContact.appendOrCreateContact)`. Call it with
`{ info: { name: { first, last }, emails: { items: [{ email, primary: true }] }, phones: { items:
[{ phone, primary: true }] } } }`, omitting absent optional fields. The factory grants the private
site app Wix's grantable `Manage Contacts` scope before generation; the SDK operation itself checks
the internal `CONTACTS.SUBMIT` permission supplied by that scope. Do not use the frontend `contacts`
API from `@wix/site-crm` in an Astro server endpoint; it relies on a browser visitor session and is
not the server-side submission API.
The visitor's submitted email identifies the contact that receives a triggered email. Never replace
it with an admissions, program, sender, or other site-level address. The sender belongs to the
published Wix triggered-email template.
For every triggered-email workflow, read the exact template contract from
`wixSolutionArchitecture.journeySolutions[].triggeredEmail`. Pass exactly those case-sensitive
variable names to Wix, resolving each value from its declared source. Do not rename them, add a
second naming convention, or add undeclared sender/recipient variables.
Read every action's `requiredConfiguration`. Only values whose `valueSource` is `wixDashboard` are
server-side environment settings supplied by the owner. `visitorInput`, `pageContext`, `siteData`,
and `generated` values must be resolved from their declared runtime source, never from environment
settings. Configuration keys use SCREAMING_SNAKE_CASE environment names (for example,
`triggeredEmailTemplateId` becomes `TRIGGERED_EMAIL_TEMPLATE_ID`). The factory has already paused
for every genuine dashboard value before this task starts. Never fabricate an ID or silently omit an
action. Treat a missing value at runtime as an internal failure and show visitors a normal retry
message; never expose setup instructions or a "not configured" state in the website.
Check `.factory/context/site.json#wixResources.formsMode` before implementing submission capture.
When it is `wixForms`, use the supplied schema. When it is `customCrm`, Wix Forms schema creation is
not available for this site: implement typed custom inputs and capture the visitor with
the submitted-contact API instead. Never attempt to create a Wix Form from browser code and never
replace submission with a configuration warning.
Do not implement business workflows with inline `<script>` submit listeners in Astro files. Use a
typed client component with explicit props for dynamic page context. Missing owner configuration is
a project setup requirement; it is never permission to replace the workflow with a warning message.

Implement every route named by the scoped task. Match the supplied desktop designs closely:
typography, colors, spacing, hierarchy, imagery, and visible states. Build reusable components
for shared navigation, footer, buttons, cards, and layout patterns. Do not leave TODOs,
placeholder sections, broken links, or explanatory prose in the UI.
Keep Astro templates conventionally formatted and readable. Never compress whole sections or
expressions into long single lines.

You may inspect and edit files and run local checks. Do not publish, release, push, change Git
remotes, access GitHub, or modify `.factory/`. The factory owns commits, backups, checks, preview,
and publishing.

Finish only after the scoped task is implemented in the repository. In the final response,
briefly state what you changed and any check you ran.
