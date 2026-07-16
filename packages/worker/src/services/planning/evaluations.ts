import type { SolutionArchitecture } from "@factory/shared";

export interface PlanningEvaluationCase {
  id: string;
  brief: string;
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  requiredEvidence: string[];
}

/** Regression corpus for architecture decisions; expand whenever a real project exposes a miss. */
export const PLANNING_EVALUATIONS: PlanningEvaluationCase[] = [
  {
    id: "dynamic-course-syllabus",
    brief:
      "A course directory has dynamic course pages. Visitors enter their name and email to receive the syllabus for the course they are viewing.",
    requiredCapabilities: ["contacts", "triggeredEmails"],
    forbiddenCapabilities: ["forms"],
    requiredEvidence: ["dynamic", "course", "contact", "triggered email"],
  },
  {
    id: "store-and-workshops",
    brief: "A ceramics studio sells physical work and takes paid bookings for scheduled workshops.",
    requiredCapabilities: ["stores", "bookings"],
    forbiddenCapabilities: [],
    requiredEvidence: ["product", "booking"],
  },
  {
    id: "simple-portfolio",
    brief: "A static portfolio for an illustrator with projects, biography, and contact details.",
    requiredCapabilities: [],
    forbiddenCapabilities: ["stores", "bookings", "events", "pricingPlans", "members"],
    requiredEvidence: [],
  },
  {
    id: "custom-directory",
    brief: "A searchable directory of independent tutors managed by the site team.",
    requiredCapabilities: ["cms"],
    forbiddenCapabilities: ["stores", "bookings"],
    requiredEvidence: ["directory", "CMS"],
  },
];

function architectureText(architecture: SolutionArchitecture) {
  return JSON.stringify(architecture).toLowerCase();
}

export function evaluatePlanningArchitecture(
  evaluation: PlanningEvaluationCase,
  architecture: SolutionArchitecture,
) {
  const selected = new Set(
    [
      ...architecture.businessSolutions,
      ...architecture.journeySolutions.flatMap((journey) => journey.wixCapabilities),
    ].map((item) => item.toLowerCase()),
  );
  const hasCapability = (expected: string) =>
    [...selected].some((item) => item.includes(expected.toLowerCase()));
  const text = architectureText(architecture);
  const failures = [
    ...evaluation.requiredCapabilities
      .filter((capability) => !hasCapability(capability))
      .map((capability) => `missing required capability ${capability}`),
    ...evaluation.forbiddenCapabilities
      .filter(hasCapability)
      .map((capability) => `selected unnecessary capability ${capability}`),
    ...evaluation.requiredEvidence
      .filter((term) => !text.includes(term.toLowerCase()))
      .map((term) => `architecture does not explain ${term}`),
  ];
  return { passed: failures.length === 0, failures };
}
