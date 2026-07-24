// The single source of truth for Wix dashboard links.
//
// Wix dashboard pages are SITE-SCOPED: they live under
// `manage.wix.com/dashboard/{metaSiteId}/…`. This is true for headless
// projects too — a headless project is a metasite and has a real dashboard at
// this path (see Wix's own docs, e.g. the SEO settings deep link
// `.../dashboard/{metaSiteId}/seo-home/seo-settings`).
//
// The load-bearing rule (AGENTS.md): NEVER fabricate a user-facing URL. So these
// links are *derived from the real site id* provisioning returned — never
// scraped from CLI text, never hardcoded, and never invented by the agent. If we
// don't have a site id, we ship no link rather than a plausible-looking dead one.

const DASHBOARD_ROOT = "https://manage.wix.com/dashboard";

/**
 * A real, site-scoped Wix dashboard URL for the given metasite id.
 *
 * `path` is an OPTIONAL relative dashboard path (e.g. `"home"`, `"automations"`,
 * `"seo-home/seo-settings"`). The factory owns the site-scoping; the agent — which
 * must never fabricate a full URL — may supply only the relative path it verified
 * from the live docs. Anything that looks like an absolute or foreign URL is
 * rejected and collapsed to the dashboard home, so a bad value can never 404 the
 * user onto some other site.
 *
 * Returns `undefined` when there is no site id: no real link, so no link.
 */
export function wixDashboardUrl(siteId: string | undefined, path?: string): string | undefined {
  if (!siteId) return undefined;
  const relative = normalizeDashboardPath(path);
  return `${DASHBOARD_ROOT}/${siteId}/${relative}`;
}

/** Keep only a safe relative path; fall back to the dashboard home otherwise. */
function normalizeDashboardPath(path: string | undefined): string {
  if (!path) return "home";
  const trimmed = path.trim();
  // Reject absolute/foreign URLs or protocol-relative junk — the agent must pass
  // a bare relative path, not a full link it guessed.
  if (!trimmed || /^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("//")) return "home";
  const cleaned = trimmed.replace(/^\/+|\/+$/g, "");
  return cleaned || "home";
}
