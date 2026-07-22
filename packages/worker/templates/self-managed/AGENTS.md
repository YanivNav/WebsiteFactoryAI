# {{businessName}}

Self-managed Wix Headless site: this repository owns the frontend and its
hosting; Wix provides business data and APIs through `@wix/sdk`.

- The Wix client lives in `src/lib/wix.ts` and needs `WIX_CLIENT_ID` (an
  OAuth app id from the Wix headless project's dashboard).
- Setup guide: https://dev.wix.com/docs/go-headless/get-started/quick-starts/self-managed-headless/quick-start-a-self-managed-headless-project
