---
name: content-and-assets
description: Decide where each piece of content lives and how the owner provides copy, images, and the logo. Read before filling any real text/images into pages.
---

# Content and assets

The site's content is split so the owner can change it easily later.

## Repeating / structured content → CMS

Anything that is a list or record (products, courses, posts, team, listings) goes in a
CMS collection and is queried at request time (see the `cms-data` skill). The owner
edits it in the Wix dashboard.

## One-off content → owner content form

Page copy, hero images, and the logo are one-off. For each section flagged
`isOwnerContent`:

- If `ownerContent` already has a value for that slot's key, use it.
- Otherwise render a clear placeholder and call `requestContent` to ask the owner for
  it — `text`/`longtext` for copy, `image` for pictures, `logo` for the site logo. Use a
  stable, descriptive `key` (e.g. `home.hero.title`) and reuse the same key across
  rebuilds so the owner's value carries forward.

## Rules

- Never invent real business facts — prices, addresses, phone numbers, hours, real
  people. Placeholder + `requestContent` instead.
- Don't put one-off page copy into a CMS collection, and don't hardcode repeating data
  that belongs in one.
