import type {
  ImplementationPlan,
  ImplementationUnit,
  SolutionArchitecture,
  Specification,
} from "@factory/shared";
import { hashInputs } from "../../lib/hash.js";
import type { CodeDesignScreen } from ".";

export interface ImplementationPlanInput {
  specification: Specification;
  architecture: SolutionArchitecture | null;
  screens: CodeDesignScreen[];
  specificationVersion: number;
  designVersion: number;
  change: { id: string; description: string } | null;
}

function stableId(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "home"
  );
}

function routePath(pagePath: string) {
  return pagePath.split("#", 1)[0] || "/";
}

function foundationUnit(screens: CodeDesignScreen[]): ImplementationUnit {
  const representative = screens.find((screen) => routePath(screen.pagePath) === "/") ?? screens[0];
  return {
    id: "foundation",
    kind: "foundation",
    title: "shared site foundation",
    task: [
      "Implement only the shared site foundation for the approved website.",
      "Establish global typography, color and spacing tokens, base styles, shared layout, navigation, footer, buttons, and reusable primitives visible across the designs.",
      "Preserve the Wix Astro scaffold and existing working integrations.",
      "Do not implement every route or business workflow in this unit; later units own those responsibilities.",
    ].join(" "),
    screenPaths: representative ? [representative.pagePath] : [],
    acceptanceCriteria: [
      "Shared visual tokens and layout primitives match the supplied design direction.",
      "Navigation and footer are reusable rather than copied into pages.",
      "The Wix project still builds successfully.",
    ],
  };
}

function dataUnit(specification: Specification): ImplementationUnit | null {
  const collections = specification.infrastructure.cmsCollections;
  if (collections.length === 0) return null;
  return {
    id: "wix-content-data",
    kind: "data",
    title: "Wix content data",
    task: [
      "Implement the Wix CMS data-access layer for every collection in the approved site plan.",
      `Collections: ${collections.map((collection) => collection.name).join(", ")}.`,
      "Use the verified collection IDs and Wix SDK operations from .factory/context/site.json.",
      "Provide typed query helpers and useful empty/error handling for later route units.",
      "Do not create local fixture arrays and do not build unrelated page layouts in this unit.",
    ].join(" "),
    screenPaths: [],
    acceptanceCriteria: [
      "Every planned CMS collection has a typed Wix-backed query path.",
      "No CMS-backed entity is represented by a local fixture data file.",
      "Empty and failed queries have safe application-level handling.",
    ],
  };
}

function workflowUnits(
  specification: Specification,
  architecture: SolutionArchitecture | null,
): ImplementationUnit[] {
  return specification.infrastructure.visitorWorkflows.map((workflow) => {
    const solution = architecture?.journeySolutions.find(
      (candidate) => candidate.journeyId === workflow.id,
    );
    const details = solution
      ? [
          `Required pattern: ${solution.pattern}.`,
          `Frontend responsibilities: ${solution.frontendResponsibilities.join("; ") || "none"}.`,
          `Backend responsibilities: ${solution.backendResponsibilities.join("; ") || "none"}.`,
          `Ordered data flow: ${solution.dataFlow.join(" -> ") || "follow the site plan"}.`,
        ]
      : [];
    return {
      id: `workflow-${stableId(workflow.id)}`,
      kind: "workflow" as const,
      title: workflow.name,
      task: [
        `Implement only the complete “${workflow.name}” visitor workflow as a reusable feature.`,
        workflow.description,
        workflow.dynamicContext
          ? `Dynamic context must come from ${workflow.dynamicContext}; never hardcode it.`
          : "The workflow has no dynamic page context.",
        `Ordered actions: ${workflow.actions
          .map((action) => `${action.type}: ${action.description}`)
          .join(" -> ")}.`,
        ...details,
        "Implement typed frontend and server-side pieces, validation, submitting, success, and safe failure states.",
        "Do not build unrelated routes in this unit; route units will place and style the feature.",
      ].join(" "),
      screenPaths: [],
      acceptanceCriteria: [
        ...workflow.actions.map((action) => action.description),
        workflow.successResult,
        ...(solution?.acceptanceTests ?? []),
      ],
    };
  });
}

function solutionUnits(
  specification: Specification,
  architecture: SolutionArchitecture | null,
): ImplementationUnit[] {
  return specification.infrastructure.wixBusinessSolutions.map((solution) => {
    const relevantJourneys =
      architecture?.journeySolutions.filter((journey) =>
        journey.wixCapabilities.some((capability) =>
          capability.toLowerCase().includes(solution.toLowerCase()),
        ),
      ) ?? [];
    return {
      id: `solution-${stableId(solution)}`,
      kind: "solution" as const,
      title: `Wix ${solution}`,
      task: [
        `Implement the reusable Wix ${solution} integration required by the approved site plan.`,
        "Use the current SDK packages and operations recorded in .factory/context/site.json#wixCapabilitySnapshot.",
        relevantJourneys.length > 0
          ? `Relevant journeys: ${relevantJourneys
              .map((journey) => `${journey.journeyId}: ${journey.pattern}`)
              .join("; ")}.`
          : "Provide only the data and action boundaries required by the approved pages; do not invent extra product behavior.",
        "Implement typed data/action helpers and useful loading, empty, and failure handling for later route units.",
        "Do not build unrelated page layouts in this unit.",
      ].join(" "),
      screenPaths: [],
      acceptanceCriteria: [
        `The site uses the Wix ${solution} SDK rather than local mock business data.`,
        "The integration exposes reusable typed operations for the approved routes and journeys.",
        "The Wix project builds with the selected SDK dependencies.",
      ],
    };
  });
}

function screenUnits(
  specification: Specification,
  screens: CodeDesignScreen[],
): ImplementationUnit[] {
  const byRoute = new Map<string, { pageTitle: string | null; screens: CodeDesignScreen[] }>();
  for (const page of specification.pages) {
    byRoute.set(routePath(page.path), { pageTitle: page.title, screens: [] });
  }
  for (const screen of screens) {
    const route = routePath(screen.pagePath);
    const entry = byRoute.get(route) ?? { pageTitle: null, screens: [] };
    entry.screens.push(screen);
    byRoute.set(route, entry);
  }
  return [...byRoute.entries()].map(([route, entry]) => ({
    id: `screen-${stableId(route)}`,
    kind: "screen" as const,
    title:
      route === "/"
        ? "Home page"
        : (entry.pageTitle ?? entry.screens.map((screen) => screen.pageTitle).join(" and ")),
    task: [
      `Implement the complete ${route} route and only the states belonging to this route.`,
      entry.screens.length > 0
        ? `Design states: ${entry.screens
            .map((screen) => `${screen.pageTitle} (${screen.pagePath})`)
            .join(", ")}.`
        : "No dedicated Stitch screen was supplied; follow the approved site plan and established shared visual system.",
      "Match the attached designs closely and compose the shared foundation, Wix data access, and visitor-workflow features already implemented by earlier units.",
      "Every visible control in these states must work. Preserve all previously verified routes and features.",
    ].join(" "),
    screenPaths: entry.screens.map((screen) => screen.pagePath),
    acceptanceCriteria: [
      `The ${route} route renders without errors and matches every supplied state.`,
      "Visible interactions are connected to their implemented feature or have correct navigation behavior.",
      "The route uses shared components and Wix-backed data where required.",
    ],
  }));
}

export function createImplementationPlan(input: ImplementationPlanInput): ImplementationPlan {
  const source = {
    specificationVersion: input.specificationVersion,
    designVersion: input.designVersion,
    changeRequestId: input.change?.id ?? null,
  };
  const contentDataUnit = dataUnit(input.specification);
  const units: ImplementationUnit[] = input.change
    ? [
        {
          id: `change-${stableId(input.change.id)}`,
          kind: "change",
          title: "requested website change",
          task: [
            "Implement only this approved website change against the existing site:",
            input.change.description,
            "Inspect the approved plan, architecture, and designs for context. Preserve unrelated behavior and visual work.",
          ].join(" "),
          screenPaths: input.screens.map((screen) => screen.pagePath),
          acceptanceCriteria: [
            input.change.description,
            "Existing routes and visitor workflows continue to build and behave correctly.",
          ],
        },
      ]
    : [
        foundationUnit(input.screens),
        ...(contentDataUnit ? [contentDataUnit] : []),
        ...solutionUnits(input.specification, input.architecture),
        ...workflowUnits(input.specification, input.architecture),
        ...screenUnits(input.specification, input.screens),
      ];
  const planHash = hashInputs({ source, units });
  return { planHash, source, units };
}

export function screensForUnit(unit: ImplementationUnit, screens: CodeDesignScreen[]) {
  const selected = new Set(unit.screenPaths);
  return screens.filter((screen) => selected.has(screen.pagePath));
}
