---
name: wix-foundations
description: The non-negotiable rules for building any Wix Headless site. Read this first, before writing any code.
---

# Wix Headless foundations

These rules are the difference between a real site and a throwaway. They apply to
everything you build; read the more specific skills for each area on top of these.

1. **Use the Wix JavaScript SDK — never hand-write REST.** Install and import the
   `@wix/*` packages (`@wix/data`, `@wix/crm`, `@wix/ecom`/`@wix/stores`,
   `@wix/bookings`, `@wix/redirects`, …). NEVER call `fetch("https://www.wixapis.com/…")`
   by hand — the scaffold is authorized and the SDK handles auth. If you don't know the
   exact call, read the project's Wix skill for that area (from `projectWixSkills`)
   rather than guessing.

2. **Never hardcode dynamic content.** Anything the spec backs by a collection is
   created, seeded, and then **queried from the CMS at request time** (see the
   `cms-data` skill). A hardcoded array standing in for collection data is a bug.

3. **Never reference config that nothing sets.** Do not read an env var, secret, or
   `locals` value that isn't actually provided (e.g. a made-up `WIX_*_TRIGGER_ID`). If
   your code needs an owner-supplied value, read it from a real, documented env var AND
   raise a `reportManualTask` telling the owner to set it. Referencing an unset value is
   a broken build, not a valid stub.

4. **Write clean, readable, multi-line, indented code.** Never emit minified or
   single-line files. Reconstruct markup as well-formatted Astro/HTML.

5. **Build to the approved design.** Call `readDesign(path)` for a page's approved HTML
   and adapt it faithfully into clean Astro — layout, sections, styles, copy — rather
   than inventing a layout from the text summary.
