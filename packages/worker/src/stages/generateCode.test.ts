import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectSpecification, parseWixSolutionArchitecture } from "@factory/shared";
import { requiredWorkflowSetup } from "./generateCode";

function syllabusSpecification() {
  return parseProjectSpecification({
    summary: "A course directory that emails the selected syllabus to a student.",
    pages: [],
    infrastructure: {
      cmsCollections: [],
      wixBusinessSolutions: [],
      visitorWorkflows: [
        {
          id: "request_syllabus",
          name: "Request a syllabus",
          description: "Email the current course syllabus to the requesting student.",
          dynamicContext: "Current course",
          inputs: [
            {
              name: "email",
              type: "email",
              required: true,
              source: "visitor",
              description: "Student email that receives the syllabus",
            },
          ],
          actions: [
            {
              type: "sendTriggeredEmail",
              description: "Send the syllabus to the contact created from the submitted email.",
              requiresManualSetup: true,
              requiredConfiguration: [
                {
                  key: "triggeredEmailTemplateId",
                  description: "Published Wix triggered-email template ID",
                },
                {
                  key: "syllabusDownloadUrlMechanism",
                  description: "Resolve the current course syllabus from page data",
                },
                {
                  key: "senderEmail",
                  description: "Email sender",
                },
                {
                  key: "admissionsEmail",
                  description: "Admissions recipient",
                },
              ],
            },
          ],
          successResult: "The student sees a sent confirmation.",
        },
      ],
    },
  });
}

function syllabusArchitecture() {
  return parseWixSolutionArchitecture({
    summary: "Custom contact and triggered-email workflow",
    businessSolutions: [],
    journeySolutions: [
      {
        journeyId: "request_syllabus",
        pattern: "custom_contact_triggered_email",
        rationale: "Dynamic course context requires a custom backend workflow.",
        wixCapabilities: ["contacts", "triggeredEmails"],
        frontendResponsibilities: [],
        backendResponsibilities: [],
        dataFlow: [],
        rejectedAlternatives: [],
        requiredConfiguration: [
          {
            key: "triggeredEmailTemplateId",
            description: "Published Wix Email ID",
            canAutomate: false,
            valueSource: "wixDashboard",
          },
        ],
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
              description: "Title of the course being viewed",
              valueSource: "pageContext",
            },
            {
              name: "syllabusDownloadUrl",
              description: "Download URL resolved from the course syllabus file",
              valueSource: "siteData",
            },
          ],
        },
        acceptanceTests: [],
      },
    ],
    cmsCollections: [],
    risks: [],
  });
}

test("syllabus setup asks only for the published template ID", () => {
  const tasks = requiredWorkflowSetup(
    syllabusSpecification(),
    "bc2e9f49-6bcc-40a3-9b18-cf63f37c447f",
    syllabusArchitecture(),
  );

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.taskKey, "request_syllabus:triggeredEmailTemplateId");
  assert.equal(tasks[0]?.title, "Create the triggered email");
  assert.equal(tasks[0]?.configuration?.key, "triggeredEmailTemplateId");
  assert.match(tasks[0]?.description ?? "", /visitor's submitted email/);
  assert.equal(
    tasks[0]?.wixDashboardUrl,
    "https://www.wix.com/dashboard/bc2e9f49-6bcc-40a3-9b18-cf63f37c447f/developer-tools/triggered-emails",
  );
  assert.deepEqual(
    tasks[0]?.configuration?.expectedFields?.map((field) => field.name),
    ["recipientName", "courseTitle", "syllabusDownloadUrl"],
  );
  assert.doesNotMatch(JSON.stringify(tasks), /admissions|senderEmail|DownloadUrlMechanism/i);
});

test("visitor, page, site, and generated values never become manual tasks", () => {
  const specification = syllabusSpecification();
  const action = specification.infrastructure.visitorWorkflows[0]!.actions[0]!;
  action.requiredConfiguration = [
    {
      key: "recipientEmail",
      description: "Submitted student email",
      valueSource: "visitorInput",
    },
    {
      key: "courseSlug",
      description: "Current course slug",
      valueSource: "pageContext",
    },
    {
      key: "syllabusUrl",
      description: "Syllabus stored on the course",
      valueSource: "siteData",
    },
    {
      key: "contactId",
      description: "Contact created by the workflow",
      valueSource: "generated",
    },
  ];

  assert.deepEqual(requiredWorkflowSetup(specification), []);
});
