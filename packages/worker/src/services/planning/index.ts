import { dynamicTool, tool } from "ai";
import { z } from "zod";
import {
  BusinessRequirements,
  WixCapabilitySnapshot,
  WixSolutionArchitecture,
  type AnswerSet,
  type CapabilitySnapshot,
  type Requirements,
  type SolutionArchitecture,
} from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";
import { AiSdkAgentRuntime, type AgentRuntime } from "../agents";
import {
  normalizeCapabilitySdkPackages,
  WIX_CAPABILITY_SDK_PACKAGES,
} from "../wix/sdk-package-registry.js";

const CAPABILITY_CATALOG = {
  cms: {
    name: "Wix CMS",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.cms,
    sources: [
      "https://dev.wix.com/docs/sdk/backend-modules/data/items/introduction",
      "https://dev.wix.com/docs/rest/business-management/data/data-collections/introduction",
    ],
  },
  contacts: {
    name: "Wix CRM Contacts",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.contacts,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/crm/contacts/introduction"],
  },
  triggeredEmails: {
    name: "Wix Triggered Emails",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.triggeredEmails,
    sources: [
      "https://dev.wix.com/docs/develop-websites/articles/workspace-tools/developer-tools/triggered-emails/about-triggered-emails",
      "https://dev.wix.com/docs/develop-websites/articles/workspace-tools/developer-tools/triggered-emails/set-up-a-triggered-email",
    ],
  },
  forms: {
    name: "Wix Forms",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.forms,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/forms/introduction"],
  },
  stores: {
    name: "Wix Stores",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.stores,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/stores/introduction"],
  },
  bookings: {
    name: "Wix Bookings",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.bookings,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/bookings/introduction"],
  },
  events: {
    name: "Wix Events",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.events,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/events/introduction"],
  },
  blog: {
    name: "Wix Blog",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.blog,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/blog/introduction"],
  },
  members: {
    name: "Wix Members",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.members,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/members/introduction"],
  },
  pricingPlans: {
    name: "Wix Pricing Plans",
    sdkPackages: WIX_CAPABILITY_SDK_PACKAGES.pricingPlans,
    sources: ["https://dev.wix.com/docs/sdk/backend-modules/pricing-plans/introduction"],
  },
} as const;

type CapabilityId = keyof typeof CAPABILITY_CATALOG;

const SOLUTION_PATTERNS = {
  custom_contact_triggered_email: {
    useWhen:
      "A custom Headless form must combine visitor input with dynamic page context and immediately send personalized content.",
    flow: [
      "typed custom inputs",
      "server endpoint",
      "append or create Wix contact",
      "send triggered email with page-derived variables",
    ],
    avoidWhen: "The business explicitly needs each submission stored and managed in Wix Forms.",
    requiredContract:
      "Define the exact triggeredEmail template variables, their meanings, and runtime sources. The recipient is the Wix Contact ID, not a template variable.",
  },
  wix_forms_submission: {
    useWhen:
      "The submission itself must be stored, viewed, and managed in the Wix Forms inbox using a stable form schema.",
    flow: ["Wix Forms schema", "interactive client form", "create submission"],
    avoidWhen:
      "The visible fields are merely inputs to a dynamic custom workflow and no Forms inbox is required.",
  },
  wix_business_solution: {
    useWhen:
      "A dedicated Wix product already owns the business entity and lifecycle, such as Stores products or Bookings services.",
    flow: [
      "install solution",
      "configure business entities",
      "query or mutate through current SDK",
    ],
    avoidWhen: "The content is custom editorial data without that product's lifecycle.",
  },
  custom_cms_workflow: {
    useWhen: "The business needs custom structured content or records not owned by a Wix solution.",
    flow: ["create CMS schema", "seed or manage items", "query from dynamic pages"],
    avoidWhen: "The entity belongs to Stores, Bookings, Blog, Events, or another Wix product.",
  },
} as const;

export interface PlanningInputs {
  brief: string;
  answers: AnswerSet["answers"];
  designFeedback: string[];
  specificationFeedback: string[];
}

export interface PlanningResult<T> {
  value: T;
  promptHash: string;
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function retrieveOfficialDocument(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["dev.wix.com", "support.wix.com"].includes(parsed.host)) {
    throw new Error("Only official Wix documentation can be researched");
  }
  const response = await fetch(parsed, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`Wix documentation returned ${response.status}`);
  const text = htmlToText(await response.text()).slice(0, 18_000);
  return {
    url: parsed.toString(),
    retrievedAt: new Date().toISOString(),
    content: text,
  };
}

export class SmartPlanningService {
  constructor(private readonly runtime: AgentRuntime = new AiSdkAgentRuntime()) {}

  async generateRequirements(input: PlanningInputs): Promise<PlanningResult<Requirements>> {
    const prompt = loadPrompt("requirements");
    const value = await this.runtime.runStructured({
      id: "business-requirements-analyst",
      instructions: prompt.text,
      schema: BusinessRequirements,
      tools: {
        inspectRequirementsChecklist: tool({
          description:
            "Inspect the required business-requirements dimensions before producing the requirements artifact.",
          inputSchema: z.object({ journeyIds: z.array(z.string()) }),
          execute: async ({ journeyIds }) => ({
            requiredDimensions: [
              "audiences and goals",
              "content ownership and update frequency",
              "complete visitor journeys",
              "dynamic page context",
              "business outcomes and staff operations",
              "acceptance criteria",
              "constraints and visible assumptions",
            ],
            proposedJourneyIds: journeyIds,
          }),
        }),
      },
      prompt: [
        `Client brief:\n${input.brief}`,
        `Discovery answers:\n${input.answers
          .map((answer) => `- ${answer.questionId}: ${answer.value}`)
          .join("\n")}`,
        input.specificationFeedback.length > 0
          ? `Site-plan corrections:\n${input.specificationFeedback.map((item) => `- ${item}`).join("\n")}`
          : "Site-plan corrections: none.",
        input.designFeedback.length > 0
          ? `Requirements discovered during design review:\n${input.designFeedback.map((item) => `- ${item}`).join("\n")}`
          : "Requirements discovered during design review: none.",
      ].join("\n\n"),
    });
    return { value, promptHash: prompt.hash };
  }

  async researchCapabilities(
    requirements: Requirements,
  ): Promise<PlanningResult<CapabilitySnapshot>> {
    const prompt = loadPrompt("wix-research");
    const capabilityIds = Object.keys(CAPABILITY_CATALOG) as CapabilityId[];
    const inspectDocumentation = dynamicTool({
      description:
        "Load current official Wix documentation for a potentially relevant capability. Use only capabilities relevant to the requirements.",
      inputSchema: z.object({
        capabilityId: z.enum(capabilityIds as [CapabilityId, ...CapabilityId[]]),
      }),
      execute: async (input) => {
        const { capabilityId } = input as { capabilityId: CapabilityId };
        const capability = CAPABILITY_CATALOG[capabilityId];
        const documents = await Promise.all(
          capability.sources.map(async (url) => {
            try {
              return await retrieveOfficialDocument(url);
            } catch (error) {
              return {
                url,
                retrievedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );
        return {
          id: capabilityId,
          name: capability.name,
          sdkPackages: capability.sdkPackages,
          documents,
        };
      },
    });
    const value = await this.runtime.runStructured({
      id: "wix-capability-researcher",
      instructions: prompt.text,
      schema: WixCapabilitySnapshot,
      maxSteps: 16,
      tools: {
        listWixCapabilities: tool({
          description: "List the Wix capability areas available for focused research.",
          inputSchema: z.object({}),
          execute: async () =>
            Object.entries(CAPABILITY_CATALOG).map(([id, item]) => ({
              id,
              name: item.name,
              sdkPackages: item.sdkPackages,
              sources: item.sources,
            })),
        }),
        inspectOfficialWixDocumentation: inspectDocumentation,
      },
      prompt: `Business requirements:\n${JSON.stringify(requirements, null, 2)}`,
    });
    return { value: normalizeCapabilitySdkPackages(value), promptHash: prompt.hash };
  }

  async designArchitecture(
    requirements: Requirements,
    capabilities: CapabilitySnapshot,
  ): Promise<PlanningResult<SolutionArchitecture>> {
    const prompt = loadPrompt("wix-architecture");
    const patternIds = Object.keys(SOLUTION_PATTERNS) as Array<keyof typeof SOLUTION_PATTERNS>;
    const value = await this.runtime.runStructured({
      id: "wix-solution-architect",
      instructions: prompt.text,
      schema: WixSolutionArchitecture,
      tools: {
        inspectSolutionPattern: dynamicTool({
          description:
            "Load a maintained Wix Headless solution pattern before selecting or rejecting it for a journey.",
          inputSchema: z.object({
            patternId: z.enum(
              patternIds as [keyof typeof SOLUTION_PATTERNS, ...(keyof typeof SOLUTION_PATTERNS)[]],
            ),
          }),
          execute: async (input) => {
            const { patternId } = input as { patternId: keyof typeof SOLUTION_PATTERNS };
            return { id: patternId, ...SOLUTION_PATTERNS[patternId] };
          },
        }),
      },
      prompt: [
        `Business requirements:\n${JSON.stringify(requirements, null, 2)}`,
        `Persisted Wix capability research:\n${JSON.stringify(capabilities, null, 2)}`,
      ].join("\n\n"),
    });
    return { value, promptHash: prompt.hash };
  }
}
