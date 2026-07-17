import type { CapabilitySnapshot, SolutionArchitecture, Specification } from "@factory/shared";

/**
 * Installation inputs verified against the current Wix SDK setup documentation.
 *
 * Capability research decides which Wix capability is relevant. It does not get to
 * invent package names: npm package IDs are executable inputs and therefore come
 * from this maintained registry.
 */
export const WIX_CAPABILITY_SDK_PACKAGES = {
  cms: ["@wix/data"],
  contacts: ["@wix/crm"],
  triggeredEmails: ["@wix/site-crm"],
  forms: ["@wix/forms"],
  stores: ["@wix/stores"],
  bookings: ["@wix/bookings"],
  events: ["@wix/events"],
  blog: ["@wix/blog"],
  members: ["@wix/members"],
  pricingPlans: ["@wix/pricing-plans"],
} as const;

/**
 * Permission IDs verified against the installed Wix SDK metadata. Keep this list
 * code-owned: generated capability research must never invent executable scopes.
 */
export const WIX_APP_PERMISSION_IDS = {
  cmsRead: "SCOPE.DC-DATA.READ",
  cmsWrite: "SCOPE.DC-DATA.WRITE",
  manageContacts: "SCOPE.DC-CONTACTS.MANAGE-CONTACTS",
} as const;

export type WixCapabilityId = keyof typeof WIX_CAPABILITY_SDK_PACKAGES;

export function isWixCapabilityId(value: string): value is WixCapabilityId {
  return Object.hasOwn(WIX_CAPABILITY_SDK_PACKAGES, value);
}

function capabilityIdFromArchitectureReference(value: string): WixCapabilityId | null {
  const normalized = value.trim().toLowerCase();
  return (
    (Object.keys(WIX_CAPABILITY_SDK_PACKAGES) as WixCapabilityId[]).find((id) => {
      const candidate = id.toLowerCase();
      return normalized === candidate || normalized.startsWith(`${candidate} `);
    }) ?? null
  );
}

export function normalizeCapabilitySdkPackages(snapshot: CapabilitySnapshot): CapabilitySnapshot {
  return {
    ...snapshot,
    capabilities: snapshot.capabilities.map((capability) => ({
      ...capability,
      sdkPackages: isWixCapabilityId(capability.id)
        ? [...WIX_CAPABILITY_SDK_PACKAGES[capability.id]]
        : [],
    })),
  };
}

/** Resolve packages only for capabilities selected by the approved architecture. */
export function requiredArchitectureSdkPackages(
  snapshot: CapabilitySnapshot,
  architecture: SolutionArchitecture | null,
): string[] {
  const selected = new Set(
    (architecture?.journeySolutions.flatMap((journey) => journey.wixCapabilities) ?? [])
      .map(capabilityIdFromArchitectureReference)
      .filter((id): id is WixCapabilityId => id !== null),
  );
  const researched = new Set(snapshot.capabilities.map((capability) => capability.id));
  const capabilityIds = architecture
    ? [...selected].filter((id) => researched.has(id))
    : [...researched].filter(isWixCapabilityId);

  return [...new Set(capabilityIds.flatMap((id) => WIX_CAPABILITY_SDK_PACKAGES[id]))];
}

/** Resolve the least-privilege app permissions required by the approved site plan. */
export function requiredSpecificationAppPermissions(specification: Specification): string[] {
  const actions = new Set(
    specification.infrastructure.visitorWorkflows.flatMap((workflow) =>
      workflow.actions.map((action) => action.type),
    ),
  );
  const permissions: string[] = [];

  if (specification.infrastructure.cmsCollections.length > 0) {
    permissions.push(WIX_APP_PERMISSION_IDS.cmsRead);
  }
  if (actions.has("createCmsItem")) {
    permissions.push(WIX_APP_PERMISSION_IDS.cmsWrite);
  }
  if (actions.has("createOrUpdateContact") || actions.has("saveFormSubmission")) {
    permissions.push(WIX_APP_PERMISSION_IDS.manageContacts);
  }

  return permissions;
}
