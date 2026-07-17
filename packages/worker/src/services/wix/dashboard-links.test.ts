import assert from "node:assert/strict";
import test from "node:test";
import { appInstallerUrl, cmsDashboardUrl, triggeredEmailsDashboardUrl } from "./dashboard-links";

test("triggered email tasks deep-link to the site-scoped Wix dashboard page", () => {
  assert.equal(
    triggeredEmailsDashboardUrl("bc2e9f49-6bcc-40a3-9b18-cf63f37c447f"),
    "https://www.wix.com/dashboard/bc2e9f49-6bcc-40a3-9b18-cf63f37c447f/developer-tools/triggered-emails",
  );
});

test("dashboard links cannot be created without a Wix site ID", () => {
  assert.throws(() => triggeredEmailsDashboardUrl(" "), /site ID is required/);
});

test("CMS tasks deep-link to the verified site-scoped Wix CMS dashboard", () => {
  assert.equal(
    cmsDashboardUrl("bc2e9f49-6bcc-40a3-9b18-cf63f37c447f"),
    "https://www.wix.com/dashboard/bc2e9f49-6bcc-40a3-9b18-cf63f37c447f/database/",
  );
});

test("app permission tasks use Wix's documented install and update entry point", () => {
  assert.equal(
    appInstallerUrl("5e4bf384-c9b8-4e98-a18e-1465092ca142"),
    "https://wix.com/app-installer?appId=5e4bf384-c9b8-4e98-a18e-1465092ca142",
  );
});
