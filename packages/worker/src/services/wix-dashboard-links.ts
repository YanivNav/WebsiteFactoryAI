/**
 * Verified Wix dashboard deep links, built from a real site id.
 *
 * The coding agent must never invent a dashboard URL (AGENTS.md: a confident
 * link to a dead page is worse than no link). Instead it names a destination
 * from this registry and the factory resolves it. An unknown name yields no
 * link rather than a guess.
 *
 * Sources:
 * - triggeredEmails: https://dev.wix.com/docs/develop-websites/articles/workspace-tools/developer-tools/triggered-emails/set-up-a-triggered-email
 */
const LINKS: Record<string, (siteId: string) => string> = {
  triggeredEmails: (siteId) => `https://www.wix.com/dashboard/${siteId}/developer-tools/triggered-emails`,
  home: (siteId) => `https://www.wix.com/dashboard/${siteId}/home`,
};

export type WixDashboardLink = keyof typeof LINKS;

/** Resolve a named destination to a real dashboard URL, or undefined if unknown. */
export function dashboardLink(name: string | undefined, siteId: string | undefined): string | undefined {
  if (!name || !siteId) return undefined;
  return LINKS[name]?.(siteId);
}
