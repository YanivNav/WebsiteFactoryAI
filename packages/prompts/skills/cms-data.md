---
name: cms-data
description: Store and show repeating/structured content with Wix CMS (Data) collections. Read before building any data-backed section or dynamic page.
---

# CMS data (Wix Data collections)

Repeating or structured content (courses, articles, team members, listings…) lives in
Wix CMS collections, not in hardcoded arrays.

## Create the collections

For every collection the spec's `businessSolutions.cms` declares — and any additional
one a page needs — call `createCollection` with fields matching the spec. Then call
`seedItems` with a few realistic rows so pages aren't empty during review. (Read the
project's Wix Data skill for the exact field types and SDK calls.)

## Read at request time

Data-backed sections (`section.data`) and dynamic pages must **query the collection with
the SDK on each request** and render the results — never a hardcoded list:

- Section showing many items → query the collection, map results into the design's
  card/table/gallery markup.
- Dynamic page (`page.dynamicPage`) → read the URL param, query the one item by its
  field, 404 if missing.

## Rules

- The collection is the source of truth; the owner edits rows later in the Wix
  dashboard, so the page must reflect whatever is in the collection.
- Match field ids/types to the spec so the CMS and the page agree.
- If a collection genuinely can't be created from code, report a manual task — don't
  fall back to hardcoded data.

## No fallback data, no swallowed errors

- **Never ship a fallback/sample/demo array** to stand in for collection data. If the
  collection is empty, render a real empty state ("No courses yet") — the owner adding a
  row must be all it takes for content to appear.
- **Never wrap the query in `try { … } catch {}`.** A silently swallowed error renders an
  empty page and hides a broken query, which is worse than failing. If you must catch,
  log the error and render a visible error/empty state that distinguishes "nothing here
  yet" from "couldn't load" — never an empty list pretending to be success.
