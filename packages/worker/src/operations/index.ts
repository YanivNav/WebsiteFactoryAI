import type { WorkOperation } from "@factory/shared";
import { buildSite } from "./build-site";
import { generateDesign } from "./generate-design";
import { generateQuestions } from "./generate-questions";
import { generateSpecification } from "./generate-specification";
import { planWixSetup } from "./plan-wix-setup";
import { publishSite } from "./publish-site";
import { setupWix } from "./setup-wix";
import type { WorkHandler } from "./types";

type HandlerRegistry = Partial<{
  [Operation in WorkOperation]: WorkHandler<Operation>;
}>;

const handlers = {
  buildSite,
  generateDesign,
  generateQuestions,
  generateSpecification,
  planWixSetup,
  publishSite,
  setupWix,
} satisfies HandlerRegistry;

export function getHandler(operation: WorkOperation): WorkHandler | undefined {
  return (handlers as HandlerRegistry)[operation] as WorkHandler | undefined;
}

export type { WorkHandler } from "./types";
