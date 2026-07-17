import type { QaPlan, Requirements, SolutionArchitecture, Specification } from "@factory/shared";
import { hashInputs } from "../../lib/hash.js";

function checkId(prefix: string, value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug || "home"}`;
}

function words(value: string) {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4);
}

function inferredWorkflowPath(
  workflow: Specification["infrastructure"]["visitorWorkflows"][number],
  specification: Specification,
) {
  const terms = words(
    [workflow.name, workflow.description, workflow.dynamicContext ?? ""].join(" "),
  );
  const ranked = specification.pages
    .map((page) => {
      const content = [
        page.title,
        page.path,
        page.description,
        ...page.sections.map((section) => `${section.type} ${section.description}`),
      ]
        .join(" ")
        .toLowerCase();
      const termScore = terms.filter((term) => content.includes(term)).length;
      const formScore =
        workflow.inputs.length > 0 &&
        page.sections.some((section) => section.type === "contactForm")
          ? 2
          : 0;
      const dynamicScore = workflow.dynamicContext && /[\[{:]|slug/i.test(page.path) ? 2 : 0;
      return { path: page.path, score: termScore + formScore + dynamicScore };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].path : "/";
}

export function createWebsiteQaPlan(input: {
  specification: Specification;
  architecture: SolutionArchitecture;
  requirements?: Requirements | null;
  specificationVersion: number;
  architectureVersion: number;
  previewVersion: number;
}): QaPlan {
  const { specification, architecture } = input;
  const routeChecks: QaPlan["checks"] = specification.pages.map((page) => ({
    id: checkId("route", page.path),
    kind: "route",
    title: `${page.title} page`,
    path: page.path,
    journeyId: null,
    workflowActions: [],
    execution: "route" as const,
    expectations: [
      "The page loads successfully without browser or request errors",
      "Images and internal navigation are not broken",
      "The page has a usable heading structure and accessible controls",
    ],
  }));
  const workflowChecks: QaPlan["checks"] = specification.infrastructure.visitorWorkflows.map(
    (workflow) => {
      const solution = architecture.journeySolutions.find(
        (candidate) => candidate.journeyId === workflow.id,
      );
      const requirement = input.requirements?.journeys.find(
        (candidate) => candidate.id === workflow.id,
      );
      // Saved architectures created before browserTest existed still have the durable business
      // actor. Only the exact legacy `visitor` actor receives a public interaction; every known
      // non-visitor actor is verified as absent from the public site.
      const legacyKind = requirement
        ? requirement.actor.trim().toLowerCase() === "visitor"
          ? ("interaction" as const)
          : ("none" as const)
        : ("interaction" as const);
      const browserTest = solution?.browserTest ?? { kind: legacyKind, path: null };
      const explicitPath = browserTest.path?.trim() || solution?.testPath?.trim();
      const inferredPath = inferredWorkflowPath(workflow, specification);
      return {
        id: checkId("workflow", workflow.id),
        kind: "workflow",
        title: workflow.name,
        path:
          browserTest.kind === "none"
            ? "/"
            : explicitPath && explicitPath !== "/"
              ? explicitPath
              : inferredPath,
        journeyId: workflow.id,
        workflowActions: workflow.actions.map((action) => action.type),
        expectations: [...(solution?.acceptanceTests ?? []), workflow.successResult],
        execution:
          browserTest.kind === "none"
            ? ("absent" as const)
            : browserTest.kind === "content"
              ? ("content" as const)
              : ("interaction" as const),
      };
    },
  );
  const source = {
    specificationVersion: input.specificationVersion,
    architectureVersion: input.architectureVersion,
    previewVersion: input.previewVersion,
  };
  const checks = [...routeChecks, ...workflowChecks];
  return {
    planHash: hashInputs({ source, checks }),
    source,
    checks,
  };
}
