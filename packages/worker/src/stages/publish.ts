/**
 * Ship it.
 *
 *   wix release  → publishes, returns the live site URL, clears the site cache
 *
 * Note what is NOT involved: GitHub. `wix release` deploys from the local checkout.
 * GitHub is a backup, not a foundation, and it is not in the critical path.
 *
 * Behind the `Publisher` interface so the `custom` publish target (self-hosted, for
 * sites needing custom auth or integrations Wix-managed cannot express) can slot in
 * later without disturbing anything.
 *
 * PHASE 5. Not implemented.
 */

// TODO(phase-5): implement WixManagedPublisher via services/wix.
// TODO(v2):      CustomPublisher.
export {};
