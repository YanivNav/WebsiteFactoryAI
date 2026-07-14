"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

// The dashboard is ALLOWED to talk to Convex directly — live-updating queries are the
// entire reason we chose it, and hiding them behind an abstraction would throw the
// benefit away. The portability rule applies to the *worker*, which holds the business
// logic. See the guardrails in CLAUDE.md.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
