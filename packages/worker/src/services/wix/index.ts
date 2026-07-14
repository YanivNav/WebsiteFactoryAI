/**
 * Wix — and ONLY Wix.
 *
 * Responsible for the Wix CLI, Wix APIs, and Wix MCP. Never mix Wix logic into
 * Claude logic, or vice versa. If you find yourself writing a prompt in this file,
 * you are in the wrong file.
 *
 * The CLI is fully scriptable, including authentication:
 *
 *   wix login --api-key $WIX_API_KEY   non-interactive; works in a container
 *   npm create @wix/new@latest -- headless --folder-name --business-name --site-template
 *   wix build      build
 *   wix preview    → shareable versioned preview URL
 *   wix release    → publish; returns the live URL
 *   wix env set --key --value
 *
 * Wix-managed headless projects are Astro 5. Wix's Astro integration handles auth
 * and SEO for us.
 *
 * PHASE 5. Not implemented.
 */

// TODO(phase-5): WixService — provision, build, preview, release.
export {};
