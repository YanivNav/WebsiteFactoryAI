import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectSpecification } from "@factory/shared";
import type { Workspace } from "../../workspace";
import type { WixSiteResources } from "../wix";
import { validateGeneratedIntegrations } from "./verification.js";

const specification = parseProjectSpecification({
  summary: "Contact site",
  pages: [],
  infrastructure: {
    cmsCollections: [],
    wixBusinessSolutions: [],
    visitorWorkflows: [
      {
        id: "contact",
        name: "Contact us",
        description: "Visitor sends a message",
        dynamicContext: "contact page",
        inputs: [],
        actions: [
          {
            type: "createOrUpdateContact",
            description: "Capture the visitor in Wix Contacts",
            requiresManualSetup: false,
            requiredConfiguration: [],
          },
        ],
        successResult: "The visitor sees confirmation",
      },
    ],
  },
});

const resources: WixSiteResources = {
  cmsCollections: [],
  formsMode: "customCrm",
  forms: [],
  media: [],
};

function workspaceWithSource(source: string) {
  return {
    glob: async () => ["src/pages/api/contact.ts"],
    readFile: async () => source,
  } as unknown as Workspace;
}

test("visitor contact capture rejects the frontend site CRM API in a server endpoint", async () => {
  await assert.rejects(
    validateGeneratedIntegrations(
      workspaceWithSource(
        'import { contacts } from "@wix/site-crm"; contacts.appendOrCreateContact({});',
      ),
      resources,
      specification,
    ),
    /submitted-contact API/,
  );
});

test("visitor contact capture requires app authentication", async () => {
  await assert.rejects(
    validateGeneratedIntegrations(
      workspaceWithSource(
        'import { submittedContact } from "@wix/crm"; submittedContact.appendOrCreateContact({});',
      ),
      resources,
      specification,
    ),
    /authenticate Wix contact submission/,
  );
});

test("visitor contact capture accepts the elevated submitted-contact API", async () => {
  await assert.doesNotReject(
    validateGeneratedIntegrations(
      workspaceWithSource(
        'import { auth } from "@wix/essentials"; import { submittedContact } from "@wix/crm"; const appendContact = auth.elevate(submittedContact.appendOrCreateContact); submittedContact.appendOrCreateContact;',
      ),
      resources,
      specification,
    ),
  );
});
