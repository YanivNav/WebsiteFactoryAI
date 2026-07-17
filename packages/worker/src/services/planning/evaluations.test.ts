import assert from "node:assert/strict";
import test from "node:test";
import type { SolutionArchitecture } from "@factory/shared";
import { evaluatePlanningArchitecture, PLANNING_EVALUATIONS } from "./evaluations";

const syllabusArchitecture: SolutionArchitecture = {
  summary: "Dynamic course context is handled by a custom Headless workflow.",
  businessSolutions: ["contacts", "triggeredEmails"],
  journeySolutions: [
    {
      journeyId: "request_syllabus",
      testPath: "/courses/{course-slug}",
      browserTest: { kind: "interaction", path: "/courses/{course-slug}" },
      pattern: "custom contact and triggered email",
      rationale:
        "The current course is dynamic, so custom inputs create a contact and send a triggered email with course variables.",
      wixCapabilities: ["contacts", "triggeredEmails"],
      frontendResponsibilities: [],
      backendResponsibilities: [],
      dataFlow: [],
      rejectedAlternatives: [
        {
          pattern: "Wix Forms",
          reason: "No Forms inbox is required and course context is dynamic.",
        },
      ],
      requiredConfiguration: [],
      triggeredEmail: {
        templateIdConfigurationKey: "triggeredEmailTemplateId",
        variables: [
          {
            name: "recipientName",
            description: "Name submitted by the visitor",
            valueSource: "visitorInput",
          },
          {
            name: "courseTitle",
            description: "Current course title",
            valueSource: "pageContext",
          },
          {
            name: "syllabusDownloadUrl",
            description: "Resolved syllabus download URL",
            valueSource: "siteData",
          },
        ],
      },
      acceptanceTests: [],
    },
  ],
  cmsCollections: [],
  risks: [],
};

test("the syllabus evaluation rejects Wix Forms and accepts the dynamic CRM workflow", () => {
  const evaluation = PLANNING_EVALUATIONS.find((item) => item.id === "dynamic-course-syllabus");
  assert.ok(evaluation);
  assert.deepEqual(evaluatePlanningArchitecture(evaluation, syllabusArchitecture), {
    passed: true,
    failures: [],
  });
});

test("the syllabus evaluation catches the old static Wix Forms mistake", () => {
  const evaluation = PLANNING_EVALUATIONS.find((item) => item.id === "dynamic-course-syllabus");
  assert.ok(evaluation);
  const wrong: SolutionArchitecture = {
    ...syllabusArchitecture,
    businessSolutions: ["forms"],
    journeySolutions: [],
  };
  const result = evaluatePlanningArchitecture(evaluation, wrong);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("forms")));
});

test("the syllabus evaluation requires the exact triggered-email variable contract", () => {
  const evaluation = PLANNING_EVALUATIONS.find((item) => item.id === "dynamic-course-syllabus");
  assert.ok(evaluation);
  const incomplete: SolutionArchitecture = {
    ...syllabusArchitecture,
    journeySolutions: syllabusArchitecture.journeySolutions.map((journey) => ({
      ...journey,
      triggeredEmail: { ...journey.triggeredEmail!, variables: [] },
    })),
  };

  const result = evaluatePlanningArchitecture(evaluation, incomplete);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("recipientName")));
});
