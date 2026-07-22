import type { WorkOperation } from "@factory/shared";
import { generateDesign } from "./generate-design";
import { generateQuestions } from "./generate-questions";
import { generateSpecification } from "./generate-specification";
import { planWixSetup } from "./plan-wix-setup";
import { setupWix } from "./setup-wix";
import type { WorkHandler } from "./types";

type HandlerRegistry = Partial<{
  [Operation in WorkOperation]: WorkHandler<Operation>;
}>;

const handlers = {
  generateDesign,
  generateQuestions,
  generateSpecification,
  planWixSetup,
  setupWix,
} satisfies HandlerRegistry;

export function getHandler(operation: WorkOperation): WorkHandler | undefined {
  return (handlers as HandlerRegistry)[operation] as WorkHandler | undefined;
}

export type { WorkHandler } from "./types";
