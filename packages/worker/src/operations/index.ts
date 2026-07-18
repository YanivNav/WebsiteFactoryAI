import type { WorkOperation } from "@factory/shared";
import { generateQuestions } from "./generate-questions";
import { generateSpecification } from "./generate-specification";
import type { WorkHandler } from "./types";

type HandlerRegistry = Partial<{
  [Operation in WorkOperation]: WorkHandler<Operation>;
}>;

const handlers = {
  generateQuestions,
  generateSpecification,
} satisfies HandlerRegistry;

export function getHandler(operation: WorkOperation): WorkHandler | undefined {
  return (handlers as HandlerRegistry)[operation] as WorkHandler | undefined;
}

export type { WorkHandler } from "./types";
