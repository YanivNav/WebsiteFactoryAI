import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProjectSpecification,
  parseWixSolutionArchitecture,
  type Requirements,
} from "@factory/shared";
import { createWebsiteQaPlan } from "./plan.js";

const specification = parseProjectSpecification({
  summary: "A school site",
  pages: [
    {
      title: "Home",
      path: "/",
      description: "School overview",
      sections: [{ type: "hero", description: "Introduction" }],
    },
    {
      title: "Course",
      path: "/courses/{course-slug}",
      description: "Course detail and syllabus request",
      sections: [{ type: "contactForm", description: "Request this course syllabus" }],
    },
  ],
  infrastructure: {
    cmsCollections: [],
    wixBusinessSolutions: [],
    visitorWorkflows: [
      {
        id: "request_syllabus",
        name: "Request syllabus",
        description: "Request the current course syllabus",
        dynamicContext: "current course",
        inputs: [
          {
            name: "email",
            type: "email",
            required: true,
            source: "visitor",
            description: "Student email",
          },
        ],
        actions: [
          {
            type: "createOrUpdateContact",
            description: "Create the student contact",
            requiresManualSetup: false,
            requiredConfiguration: [],
          },
          {
            type: "sendTriggeredEmail",
            description: "Send the syllabus",
            requiresManualSetup: true,
            requiredConfiguration: [
              {
                key: "triggeredEmailTemplateId",
                description: "Published email ID",
                valueSource: "wixDashboard",
              },
            ],
          },
        ],
        successResult: "The student sees confirmation",
      },
    ],
  },
});

const architecture = parseWixSolutionArchitecture({
  summary: "Custom syllabus workflow",
  businessSolutions: ["CMS", "CRM"],
  journeySolutions: [
    {
      journeyId: "request_syllabus",
      testPath: "/courses/{course-slug}",
      pattern: "custom_contact_triggered_email",
      rationale: "Dynamic course context",
      wixCapabilities: ["cms", "contacts", "triggeredEmails"],
      frontendResponsibilities: [],
      backendResponsibilities: [],
      dataFlow: [],
      rejectedAlternatives: [],
      requiredConfiguration: [],
      triggeredEmail: {
        templateIdConfigurationKey: "triggeredEmailTemplateId",
        variables: [],
      },
      acceptanceTests: ["The submitted course controls the syllabus URL"],
    },
  ],
  cmsCollections: [],
  risks: [],
});

test("QA plan covers every route and every visitor workflow", () => {
  const plan = createWebsiteQaPlan({
    specification,
    architecture,
    specificationVersion: 3,
    architectureVersion: 2,
    previewVersion: 1,
  });

  assert.deepEqual(
    plan.checks.map((check) => [check.kind, check.path]),
    [
      ["route", "/"],
      ["route", "/courses/{course-slug}"],
      ["workflow", "/courses/{course-slug}"],
    ],
  );
  assert.ok(plan.planHash);
});

test("legacy architecture without a test path infers the dynamic workflow route", () => {
  const legacy = parseWixSolutionArchitecture({
    ...architecture,
    journeySolutions: architecture.journeySolutions.map(
      ({ testPath: _testPath, ...journey }) => journey,
    ),
  });
  const plan = createWebsiteQaPlan({
    specification,
    architecture: legacy,
    specificationVersion: 3,
    architectureVersion: 1,
    previewVersion: 1,
  });

  assert.equal(plan.checks.at(-1)?.path, "/courses/{course-slug}");
});

test("legacy site-team journeys are checked for public absence instead of clicked", () => {
  const staffSpecification = parseProjectSpecification({
    ...specification,
    infrastructure: {
      ...specification.infrastructure,
      visitorWorkflows: [
        ...specification.infrastructure.visitorWorkflows,
        {
          id: "manage_courses",
          name: "Manage courses",
          description: "Admissions maintains courses in Wix CMS",
          dynamicContext: "course",
          inputs: [],
          actions: [
            {
              type: "createCmsItem",
              description: "Edit a Wix CMS item",
              requiresManualSetup: false,
              requiredConfiguration: [],
            },
          ],
          successResult: "Published course content appears on the site",
        },
      ],
    },
  });
  const staffArchitecture = parseWixSolutionArchitecture({
    ...architecture,
    journeySolutions: [
      ...architecture.journeySolutions,
      {
        ...architecture.journeySolutions[0],
        journeyId: "manage_courses",
        testPath: "/",
      },
    ],
  });
  const requirements = {
    journeys: [{ id: "manage_courses", actor: "siteTeam (admissions)" }],
  } as Requirements;

  const plan = createWebsiteQaPlan({
    specification: staffSpecification,
    architecture: staffArchitecture,
    requirements,
    specificationVersion: 3,
    architectureVersion: 1,
    previewVersion: 1,
  });
  const staffCheck = plan.checks.find((check) => check.journeyId === "manage_courses");

  assert.equal(staffCheck?.execution, "absent");
  assert.equal(staffCheck?.path, "/");
});
