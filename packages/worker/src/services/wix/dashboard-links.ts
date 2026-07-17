/**
 * Site-scoped Wix dashboard links verified against Wix's outward-facing routes.
 *
 * Source (checked 2026-07-17):
 * https://dev.wix.com/docs/develop-websites/articles/workspace-tools/developer-tools/triggered-emails/set-up-a-triggered-email
 * Its "Triggered Emails dashboard page" link resolves to:
 * https://www.wix.com/dashboard/{{metaSiteId}}/developer-tools/triggered-emails
 */
export function triggeredEmailsDashboardUrl(metaSiteId: string) {
  if (!metaSiteId.trim()) throw new Error("A Wix site ID is required for dashboard links");
  return `https://www.wix.com/dashboard/${encodeURIComponent(metaSiteId)}/developer-tools/triggered-emails`;
}

/**
 * Verified from Wix's official “Go to CMS” dashboard action (checked 2026-07-17):
 * https://www.wix.com/dashboard/{{metaSiteId}}/database/
 */
export function cmsDashboardUrl(metaSiteId: string) {
  if (!metaSiteId.trim()) throw new Error("A Wix site ID is required for dashboard links");
  return `https://www.wix.com/dashboard/${encodeURIComponent(metaSiteId)}/database/`;
}

/**
 * Verified Wix app install/update entry point (checked 2026-07-17):
 * https://dev.wix.com/docs/build-apps/manage-your-app/versioning/about-app-versioning
 */
export function appInstallerUrl(appId: string) {
  if (!appId.trim()) throw new Error("A Wix app ID is required for the app update link");
  return `https://wix.com/app-installer?appId=${encodeURIComponent(appId)}`;
}
