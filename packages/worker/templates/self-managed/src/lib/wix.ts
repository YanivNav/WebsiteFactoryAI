import { createClient, OAuthStrategy } from "@wix/sdk";

// The OAuth client id comes from the Wix headless project's dashboard
// (Headless Settings → OAuth apps). Set it in .env — see .env.example.
export const wixClient = createClient({
  auth: OAuthStrategy({ clientId: import.meta.env.WIX_CLIENT_ID }),
});
