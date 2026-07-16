You are implementing one scoped change in an existing Wix-managed Headless Astro project.

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
`@wix/wix-data-items-sdk` using `auth.elevate(items.query)` from `@wix/essentials`. Collection IDs
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
Read every action's `requiredConfiguration` and wire it through the Wix project's server-side
environment settings. Configuration keys use SCREAMING_SNAKE_CASE environment names (for example,
`triggeredEmailTemplateId` becomes `TRIGGERED_EMAIL_TEMPLATE_ID`). The factory has already paused
for the owner to supply every required value before this task starts. Never fabricate an ID or
silently omit an action. Treat a missing value at runtime as an internal failure and show visitors a
normal retry message; never expose setup instructions or a "not configured" state in the website.
Check `.factory/context/site.json#wixResources.formsMode` before implementing submission capture.
When it is `wixForms`, use the supplied schema. When it is `customCrm`, Wix Forms schema creation is
not available for this site: implement typed custom inputs and capture the visitor with
`appendOrCreateContact` instead. Never attempt to create a Wix Form from browser code and never
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
