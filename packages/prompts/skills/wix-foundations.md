---
name: wix-foundations
description: The non-negotiable rules for building any Wix Headless site. Read this first, before writing any code.
---

# Wix Headless foundations

These rules are the difference between a real site and a throwaway. They apply to
everything you build; read the more specific skills for each area on top of these.

1. **Prefer the Wix JavaScript SDK for CRUD operations.** Install and import the
   `@wix/*` packages (`@wix/data`, `@wix/crm`, `@wix/ecom`/`@wix/stores`,
   `@wix/bookings`, `@wix/redirects`, …). The SDK handles auth automatically in
   Astro API routes. If you don't know the exact call, read the project's Wix
   skill for that area (in `.agents/skills/`) rather than guessing.

   **When the SDK doesn't cover a feature** — the feature has no `@wix/*` package,
   or the package is a host module (starts with `@wix/site-`) that can't work in
   Headless — discover the REST endpoint. Use the `wix-docs` skill (installed in
   `.agents/skills/wix-docs/`) to search for the API, read its schema, then call it
   with a CLI-minted token (see `.agents/skills/wix-headless/references/` for the
   auth pattern for your project type). Never hardcode an endpoint or app ID you
   discovered on a previous build — search the docs fresh each time.

2. **Never hardcode dynamic content.** Anything the spec backs by a collection is
   created, seeded, and then **queried from the CMS at request time** (see the
   `cms-data` skill). A hardcoded array standing in for collection data is a bug.

3. **Never reference config that nothing sets.** Do not read an env var, secret, or
   `locals` value that isn't actually provided (e.g. a made-up `WIX_*_TRIGGER_ID`).
   If your code needs an owner-supplied value, read it from a project environment
   variable AND declare it as a **`"kind": "setting"`** entry in the report's `content`
   (with `label`, `help`, and `helpUrl`). The owner fills a labelled field in the app and
   the factory writes it into the project environment. **Never instruct the owner to set
   an environment variable, edit `.env`, or run a command** — they are a Wix
   professional, not an engineer. Referencing an unset value is a broken build.

4. **Write clean, readable, multi-line, indented code.** Never emit minified or
   single-line files. Reconstruct markup as well-formatted Astro/HTML.

5. **Build to the approved design.** Call `readDesign(path)` for a page's approved HTML
   and adapt it faithfully into clean Astro — layout, sections, styles, copy — rather
   than inventing a layout from the text summary.

6. **Wrap admin write operations with `auth.elevate()`.** Wix SDK calls that insert,
   create, update, or delete (CMS inserts, CRM contact creation, store products, …)
   must be wrapped: `const op = auth.elevate(module.someMethod); await op(...)`.
   Without it the call has no execution context and throws `Cannot read properties of
   undefined (reading 'invoke')`. Public reads — querying a CMS collection, reading a
   published item — do **not** need elevation. This only applies to REST modules
   (`@wix/crm`, `@wix/data`, `@wix/stores`, `@wix/bookings`, `@wix/ecom`, …), not
   host modules (below).

7. **Never import `@wix/site-*` host modules in a Headless project.** Packages like
   `@wix/site-crm`, `@wix/site-ecom`, `@wix/site-pricing-plans`, and
   `@wix/site-members` are **Velo host modules** — they need a Wix platform runtime
   channel and do not work in Headless API routes. There is no `auth.elevate()` that
   fixes this (it only wraps REST modules). If the site needs a feature these
   packages provide — triggered emails, a pricing-plans purchase, a member area —
   **search for the equivalent REST API** using the `wix-docs` skill. The Wix REST
   API surface is large and many host-module features have a REST equivalent the
   agent can call with a CLI token. Read the area's factory skill first (e.g.
   `emailing-visitors` for triggered emails), then the project's Wix skill docs,
   then search the docs. Only if every path is exhausted — no REST API, no
   programmatic workaround — report a **manual task** with a dashboard `helpLink`.
