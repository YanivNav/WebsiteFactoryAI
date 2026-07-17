import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "../../workspace";
import { WixAccountConfigurationError, WixCliService } from ".";
import { WIX_APP_PERMISSION_IDS } from "./sdk-package-registry.js";

test("missing Wix app permissions are added idempotently with the account API key", async () => {
  const originalApiKey = process.env.WIX_API_KEY;
  const originalAccountId = process.env.WIX_ACCOUNT_ID;
  const originalFetch = globalThis.fetch;
  const requests: Array<{
    url: string;
    method: string;
    body: unknown;
    authorization: string | null;
    accountId: string | null;
  }> = [];
  process.env.WIX_API_KEY = "test-api-key";
  process.env.WIX_ACCOUNT_ID = "account-1";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      authorization: new Headers(init?.headers).get("Authorization"),
      accountId: new Headers(init?.headers).get("wix-account-id"),
    });
    if (method === "GET") {
      return new Response(
        JSON.stringify({
          appPermissions: [{ permission: { permissionId: WIX_APP_PERMISSION_IDS.cmsRead } }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  const workspace = {
    readFile: async (path: string) => {
      assert.equal(path, "wix.config.json");
      return JSON.stringify({ siteId: "site-1", appId: "app-1" });
    },
  } as unknown as Workspace;

  try {
    const changed = await new WixCliService().ensureAppPermissions(
      [
        WIX_APP_PERMISSION_IDS.cmsRead,
        WIX_APP_PERMISSION_IDS.cmsWrite,
        WIX_APP_PERMISSION_IDS.manageContacts,
      ],
      workspace,
    );

    assert.equal(changed, true);
    assert.equal(requests.length, 3);
    assert.match(requests[0]!.url, /appId=app-1/);
    assert.equal(requests[0]!.authorization, "test-api-key");
    assert.equal(requests[0]!.accountId, "account-1");
    assert.deepEqual(
      requests.slice(1).map((request) => request.body),
      [
        {
          appPermission: {
            appId: "app-1",
            permission: { permissionId: WIX_APP_PERMISSION_IDS.cmsWrite },
          },
        },
        {
          appPermission: {
            appId: "app-1",
            permission: { permissionId: WIX_APP_PERMISSION_IDS.manageContacts },
          },
        },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.WIX_API_KEY;
    else process.env.WIX_API_KEY = originalApiKey;
    if (originalAccountId === undefined) delete process.env.WIX_ACCOUNT_ID;
    else process.env.WIX_ACCOUNT_ID = originalAccountId;
  }
});

test("Wix app permission setup requires explicit account context", async () => {
  const originalApiKey = process.env.WIX_API_KEY;
  const originalAccountId = process.env.WIX_ACCOUNT_ID;
  process.env.WIX_API_KEY = "test-api-key";
  delete process.env.WIX_ACCOUNT_ID;
  const workspace = {
    readFile: async () => JSON.stringify({ siteId: "site-1", appId: "app-1" }),
  } as unknown as Workspace;

  try {
    await assert.rejects(
      new WixCliService().ensureAppPermissions([WIX_APP_PERMISSION_IDS.cmsRead], workspace),
      (error: unknown) =>
        error instanceof WixAccountConfigurationError && /WIX_ACCOUNT_ID/.test(error.message),
    );
  } finally {
    if (originalApiKey === undefined) delete process.env.WIX_API_KEY;
    else process.env.WIX_API_KEY = originalApiKey;
    if (originalAccountId === undefined) delete process.env.WIX_ACCOUNT_ID;
    else process.env.WIX_ACCOUNT_ID = originalAccountId;
  }
});

test("under-scoped Wix API keys produce an actionable configuration error", async () => {
  const originalApiKey = process.env.WIX_API_KEY;
  const originalAccountId = process.env.WIX_ACCOUNT_ID;
  const originalFetch = globalThis.fetch;
  process.env.WIX_API_KEY = "test-api-key";
  process.env.WIX_ACCOUNT_ID = "account-1";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "Not allowed to create AppPermission" }), {
      status: 403,
    })) as typeof fetch;
  const workspace = {
    readFile: async () => JSON.stringify({ siteId: "site-1", appId: "app-1" }),
  } as unknown as Workspace;

  try {
    await assert.rejects(
      new WixCliService().ensureAppPermissions([WIX_APP_PERMISSION_IDS.cmsRead], workspace),
      (error: unknown) =>
        error instanceof WixAccountConfigurationError &&
        /Manage Custom Apps/.test(error.message) &&
        /WIX_ACCOUNT_ID/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.WIX_API_KEY;
    else process.env.WIX_API_KEY = originalApiKey;
    if (originalAccountId === undefined) delete process.env.WIX_ACCOUNT_ID;
    else process.env.WIX_ACCOUNT_ID = originalAccountId;
  }
});
