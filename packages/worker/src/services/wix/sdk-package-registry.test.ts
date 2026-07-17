import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCapabilitySdkPackages,
  requiredArchitectureSdkPackages,
  requiredSpecificationAppPermissions,
  WIX_APP_PERMISSION_IDS,
} from "./sdk-package-registry.js";
import {
  parseProjectSpecification,
  type CapabilitySnapshot,
  type SolutionArchitecture,
} from "@factory/shared";

function snapshot(): CapabilitySnapshot {
  return {
    researchedAt: "2026-07-17T00:00:00.000Z",
    unresolvedResearch: [],
    capabilities: [
      {
        id: "cms",
        name: "Wix CMS",
        status: "available",
        headlessFit: "native",
        relevantJourneyIds: ["catalog"],
        sdkPackages: ["Data Items API (Wix Data)"],
        operations: [],
        limitations: [],
        manualPrerequisites: [],
        evidence: [],
      },
      {
        id: "forms",
        name: "Wix Forms",
        status: "available",
        headlessFit: "native",
        relevantJourneyIds: ["contact"],
        sdkPackages: ["Forms APIs"],
        operations: [],
        limitations: [],
        manualPrerequisites: [],
        evidence: [],
      },
      {
        id: "contacts",
        name: "Wix CRM Contacts",
        status: "available",
        headlessFit: "native",
        relevantJourneyIds: ["syllabus"],
        sdkPackages: ["Contacts API (Contacts V4/V5)"],
        operations: [],
        limitations: [],
        manualPrerequisites: [],
        evidence: [],
      },
      {
        id: "triggeredEmails",
        name: "Wix Triggered Emails",
        status: "available",
        headlessFit: "custom_workflow",
        relevantJourneyIds: ["syllabus"],
        sdkPackages: ["Triggered Emails (dashboard + code snippet)"],
        operations: [],
        limitations: [],
        manualPrerequisites: [],
        evidence: [],
      },
    ],
  };
}

test("research prose is replaced with verified Wix npm package IDs", () => {
  const normalized = normalizeCapabilitySdkPackages(snapshot());

  assert.deepEqual(normalized.capabilities[0]?.sdkPackages, ["@wix/data"]);
  assert.deepEqual(normalized.capabilities[1]?.sdkPackages, ["@wix/forms"]);
  assert.deepEqual(normalized.capabilities[2]?.sdkPackages, ["@wix/crm"]);
  assert.deepEqual(normalized.capabilities[3]?.sdkPackages, ["@wix/site-crm"]);
});

test("only packages selected by the approved architecture are installed", () => {
  const architecture = {
    journeySolutions: [
      {
        wixCapabilities: [
          "cms (Wix Data / Data Items API)",
          "contacts (Wix CRM Contacts)",
          "triggeredEmails",
        ],
      },
    ],
  } as unknown as SolutionArchitecture;

  assert.deepEqual(requiredArchitectureSdkPackages(snapshot(), architecture), [
    "@wix/data",
    "@wix/crm",
    "@wix/site-crm",
  ]);
});

test("approved visitor workflows resolve least-privilege Wix app permissions", () => {
  const specification = parseProjectSpecification({
    summary: "A CMS site with contact capture",
    pages: [],
    infrastructure: {
      cmsCollections: [
        {
          name: "Leads",
          description: "Submitted requests",
          fields: [
            {
              name: "email",
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
          id: "contact",
          name: "Contact",
          description: "Submit a request",
          dynamicContext: null,
          inputs: [],
          actions: [
            {
              type: "createOrUpdateContact",
              description: "Capture contact",
              requiresManualSetup: false,
              requiredConfiguration: [],
            },
            {
              type: "createCmsItem",
              description: "Save the request",
              requiresManualSetup: false,
              requiredConfiguration: [],
            },
          ],
          successResult: "Confirmation",
        },
      ],
    },
  });

  assert.deepEqual(requiredSpecificationAppPermissions(specification), [
    WIX_APP_PERMISSION_IDS.cmsRead,
    WIX_APP_PERMISSION_IDS.cmsWrite,
    WIX_APP_PERMISSION_IDS.manageContacts,
  ]);
});
