/**
 * Verified registry of Wix business-solution app ids (`appDefId`), copied from
 * the official "Apps Created by Wix" reference. The build phase installs only
 * ids from this registry — it never lets the model free-form an app id
 * (AGENTS.md: never fabricate). A needed solution that isn't here becomes a
 * question/manual task instead of a guess.
 *
 * Source: https://dev.wix.com/docs/api-reference/articles/work-with-wix-apis/platform/about-apps-created-by-wix
 */
export const WIX_APP_IDS = {
  stores: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
  ecommerce: "1380b703-ce81-ff05-f115-39571d94dfcd",
  bookings: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
  blog: "14bcded7-0066-7c35-14d7-466cb3f09103",
  events: "140603ad-af8d-84a5-2c80-a0f60cb47351",
  forms: "225dd912-7dea-4738-8688-4b8c6955ffc2",
  giftCards: "d80111c5-a0f4-47a8-b63a-65b54d774a27",
  groups: "148c2287-c669-d849-d153-463c7486a694",
  invoices: "13ee94c1-b635-8505-3391-97919052c16f",
  loyalty: "553c79f3-5625-4f38-b14b-ef7c0d1e87df",
  members: "14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9",
  multilingual: "14d84998-ae09-1abf-c6fc-3f3cace5bf19",
  music: "13bb5d67-1add-e770-a71f-001277e17c57",
  onlinePrograms: "2936472a-a1ed-4ae5-9f71-614313a9f4e7",
  portfolio: "d90652a2-f5a1-4c7c-84c4-d4cdcc41f130",
  pricingPlans: "1522827f-c56c-a5c9-2ac9-00f9e6ae12d3",
  restaurantsMenus: "b278a256-2757-4f19-9313-c05c783bec92",
  restaurantsOrders: "9a5d83fd-8570-482e-81ab-cfa88942ee60",
  services: "cc552162-24a4-45e0-9695-230c4931ef40",
  subscriptions: "8725b255-2aa2-4a53-b76d-7d3c363aaeea",
  tableReservations: "f9c07de2-5341-40c6-b096-8eb39de391fb",
  video: "14409595-f076-4753-8303-9a86f9f71469",
} as const;

export type WixAppKey = keyof typeof WIX_APP_IDS;

/**
 * Platform capabilities always available on a headless project — they are not
 * market-installable apps (the App Installation API returns
 * APPS_NOT_FOUND_IN_APPS_SERVICE for them), so a spec mentioning them must not
 * be installed or raised as a task. CMS/Wix Data is the site's own database;
 * CRM/Contacts and Automations are platform features.
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

/** Aliases the spec's free-form solution names may use → registry key. */
const ALIASES: Record<string, WixAppKey> = {
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

export type AppResolution =
  | { kind: "app"; key: WixAppKey; appDefId: string }
  | { kind: "builtIn" }
  | { kind: "unknown" };

/** Resolve a spec business-solution name to an installable app id, a built-in, or unknown. */
export function resolveApp(name: string): AppResolution {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
  if (BUILT_IN.has(normalized)) return { kind: "builtIn" };

  const directKey = (Object.keys(WIX_APP_IDS) as WixAppKey[]).find(
    (key) => key.toLowerCase() === normalized,
  );
  const key = directKey ?? ALIASES[normalized];
  if (key) return { kind: "app", key, appDefId: WIX_APP_IDS[key] };
  return { kind: "unknown" };
}
