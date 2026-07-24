import type { Workspace } from "../workspace";

/**
 * Platform features always available on a headless project — they are not
 * market-installable apps. These names describe architectural categories, not
 * specific Wix apps.
 */
const BUILT_IN = new Set([
  "cms",
  "data",
  "crm",
  "contacts",
  "inbox",
  "automations",
  "automation",
  "seo",
  "email",
  "triggeredemails",
]);

/**
 * Baseline app-id registry, kept in sync with the "Apps Created by Wix" page.
 * Used only as a fallback when the project's Wix skills are unavailable (e.g.
 * before skills are installed). When skills are installed, `resolveApp` reads
 * from them instead — they are the authoritative source.
 *
 * Source: https://dev.wix.com/docs/api-reference/articles/work-with-wix-apis/platform/about-apps-created-by-wix
 */
const FALLBACK_APP_IDS: Record<string, string> = {
  stores: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
  ecommerce: "1380b703-ce81-ff05-f115-39571d94dfcd",
  bookings: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
  blog: "14bcded7-0066-7c35-14d7-466cb3f09103",
  events: "140603ad-af8d-84a5-2c80-a0f60cb47351",
  forms: "225dd912-7dea-4738-8688-4b8c6955ffc2",
  portfolio: "d90652a2-f5a1-4c7c-84c4-d4cdcc41f130",
  pricingPlans: "1522827f-c56c-a5c9-2ac9-00f9e6ae12d3",
  restaurantsMenus: "b278a256-2757-4f19-9313-c05c783bec92",
  restaurantsOrders: "9a5d83fd-8570-482e-81ab-cfa88942ee60",
  services: "cc552162-24a4-45e0-9695-230c4931ef40",
  tableReservations: "f9c07de2-5341-40c6-b096-8eb39de391fb",
};

export type AppResolution =
  | { kind: "app"; appDefId: string }
  | { kind: "builtIn" }
  | { kind: "unknown" };

/**
 * Resolve a spec business-solution name to an app id or built-in. When a
 * workspace is provided, reads from the project's installed Wix skills first
 * (SETUP.md, kept current by `wix skills update`). Falls back to the baseline
 * registry when skills aren't available.
 */
export async function resolveApp(
  name: string,
  workspace?: Workspace,
): Promise<AppResolution> {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
  if (BUILT_IN.has(normalized)) return { kind: "builtIn" };

  // Try the project's installed skills first — they're the authoritative
  // source (kept current by `wix skills update`).
  if (workspace) {
    const fromSkills = await resolveFromSkills(normalized, workspace);
    if (fromSkills) return fromSkills;
  }

  // Fall back to the baseline registry (last resort).
  const appDefId = lookupAppId(normalized, FALLBACK_APP_IDS);
  if (appDefId) return { kind: "app", appDefId };

  return { kind: "unknown" };
}

/** Resolve an app name → appDefId using the installed Wix Headless skill's SETUP.md. */
async function resolveFromSkills(
  normalized: string,
  workspace: Workspace,
): Promise<AppResolution | null> {
  try {
    const setupPath = ".agents/skills/wix-headless/references/SETUP.md";
    if (!(await workspace.hasFile(setupPath))) return null;
    const content = await workspace.readFile(setupPath);
    if (!content) return null;

    // Parse lines like: - **stores** → `215238eb-...`
    const appIds = parseAppIdsFromSetup(content);
    if (!appIds) return null;

    const direct = lookupAppId(normalized, appIds);
    if (direct) return { kind: "app", appDefId: direct };

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse app-id entries from a Wix Headless SETUP.md. Each entry looks like:
 *   - **key** → `guid`
 */
function parseAppIdsFromSetup(content: string): Record<string, string> | null {
  const map: Record<string, string> = {};
  const regex = /^\s*-\s*\*\*(.+?)\*\*\s*→\s*`([a-f0-9-]+)`/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const rawKey = match[1]!.trim();
    const guid = match[2]!.trim();
    const normalizedKey = rawKey.toLowerCase().replace(/[^a-z]/g, "");
    if (normalizedKey && guid) map[normalizedKey] = guid;
  }
  return Object.keys(map).length > 0 ? map : null;
}

function lookupAppId(
  normalized: string,
  map: Record<string, string>,
): string | undefined {
  // Direct key match.
  if (map[normalized]) return map[normalized];

  // Common aliases — these are natural-language terms the LLM uses that
  // don't always match the skill's key directly.
  const aliases: Record<string, string> = {
    store: "stores",
    ecom: "ecommerce",
    "e-commerce": "ecommerce",
    booking: "bookings",
    scheduling: "bookings",
    form: "forms",
    wixforms: "forms",
    event: "events",
    ticketing: "events",
    membersarea: "members",
    membership: "members",
    memberships: "members",
    pricingplan: "pricingPlans",
    plans: "pricingPlans",
    courses: "onlinePrograms",
    programs: "onlinePrograms",
    gallery: "portfolio",
    restaurant: "restaurantsMenus",
    restaurants: "restaurantsMenus",
    menus: "restaurantsMenus",
  };
  const key = aliases[normalized];
  return key ? map[key] : undefined;
}
