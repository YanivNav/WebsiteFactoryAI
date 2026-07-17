import assert from "node:assert/strict";
import test from "node:test";
import type { Specification } from "@factory/shared";
import { createImplementationPlan } from "./plan";

const specification: Specification = {
  summary: "A course website",
  pages: [
    { title: "Home", path: "/", description: "Overview", sections: [] },
    {
      title: "Course",
      path: "/courses/{course-slug}",
      description: "Course details",
      sections: [],
    },
    { title: "About", path: "/about", description: "About the school", sections: [] },
  ],
  infrastructure: {
    cmsCollections: [
      {
        name: "Courses",
        description: "Course content",
        fields: [
          {
            name: "title",
            type: "text",
            description: null,
            referencedCollection: null,
          },
        ],
      },
    ],
    wixBusinessSolutions: [],
    visitorWorkflows: [
      {
        id: "request_syllabus",
        name: "Request a syllabus",
        description: "Email the current course syllabus",
        dynamicContext: "current course",
        inputs: [],
        actions: [
          {
            type: "createOrUpdateContact",
            description: "Save the visitor as a contact",
            requiresManualSetup: false,
            requiredConfiguration: [],
          },
          {
            type: "sendTriggeredEmail",
            description: "Send the selected syllabus",
            requiresManualSetup: true,
            requiredConfiguration: [
              {
                key: "triggeredEmailTemplateId",
                description: "Published triggered email template",
                valueSource: "wixDashboard",
              },
            ],
          },
        ],
        successResult: "The visitor sees a sent confirmation",
      },
    ],
  },
};

const screens = [
  {
    pageTitle: "Home",
    pagePath: "/",
    htmlPath: ".factory/context/screens/home.html",
    screenshotPath: ".factory/context/screens/home.png",
  },
  {
    pageTitle: "Course detail",
    pagePath: "/courses/{course-slug}",
    htmlPath: ".factory/context/screens/course.html",
    screenshotPath: ".factory/context/screens/course.png",
  },
  {
    pageTitle: "Syllabus dialog",
    pagePath: "/courses/{course-slug}#syllabus",
    htmlPath: ".factory/context/screens/dialog.html",
    screenshotPath: ".factory/context/screens/dialog.png",
  },
];

test("initial implementation is split into foundation, data, workflow, and route units", () => {
  const plan = createImplementationPlan({
    specification,
    architecture: null,
    screens,
    specificationVersion: 2,
    designVersion: 3,
    change: null,
  });

  assert.deepEqual(
    plan.units.map((unit) => unit.kind),
    ["foundation", "data", "workflow", "screen", "screen", "screen"],
  );
  const course = plan.units.find((unit) => unit.id === "screen-courses-course-slug");
  assert.deepEqual(course?.screenPaths, [
    "/courses/{course-slug}",
    "/courses/{course-slug}#syllabus",
  ]);
  assert.deepEqual(plan.units.find((unit) => unit.id === "screen-about")?.screenPaths, []);
});

test("a later change request becomes one bounded implementation unit", () => {
  const plan = createImplementationPlan({
    specification,
    architecture: null,
    screens,
    specificationVersion: 2,
    designVersion: 3,
    change: { id: "change_42", description: "Add an alumni quote to the course page" },
  });

  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0]?.kind, "change");
  assert.match(plan.units[0]?.task ?? "", /alumni quote/);
});

test("each Wix business solution receives its own integration unit", () => {
  const solutionSpecification: Specification = {
    ...specification,
    infrastructure: {
      ...specification.infrastructure,
      wixBusinessSolutions: ["stores", "bookings"],
    },
  };
  const plan = createImplementationPlan({
    specification: solutionSpecification,
    architecture: null,
    screens,
    specificationVersion: 2,
    designVersion: 3,
    change: null,
  });

  assert.deepEqual(
    plan.units.filter((unit) => unit.kind === "solution").map((unit) => unit.id),
    ["solution-stores", "solution-bookings"],
  );
});
