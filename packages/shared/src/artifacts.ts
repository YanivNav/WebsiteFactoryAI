/**
 * Artifacts are append-only and versioned. Never overwrite — always add a version.
 * `Specification v1, v2, v3…` is the whole point: every generated output is
 * immutable, and rejection produces a new version rather than mutating the old one.
 */

import z from "zod";

export const ARTIFACT_TYPES = [
  "brief",
  "questions",
  "answers",
  "businessRequirements",
  "wixCapabilitySnapshot",
  "wixSolutionArchitecture",
  "implementationPlan",
  "specification",
  "design",
  "buildReport",
  "preview",
  "websiteQaPlan",
  "websiteQaReport",
  "releaseReport",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const REVIEW_STATUSES = ["waiting", "approved", "rejected", "needs_changes"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * One item of review feedback. Free text by default; feedback left while viewing a
 * specific design screen carries that screen's identity, which is what lets the
 * design stage revise exactly that screen instead of regenerating everything.
 *
 * This is a first-class type, NOT a convention. Feedback used to travel as
 * JSON-encoded strings that four different files re-parsed with try/JSON.parse —
 * that pattern is banned. If feedback needs a new field, add it here.
 */
export const ReviewFeedbackItem = z.object({
  comment: z.string(),
  screen: z.object({ screenId: z.string(), pageTitle: z.string() }).optional(),
});

export type ReviewFeedback = z.infer<typeof ReviewFeedbackItem>;

/** A design revision is "targeted" when every comment points at a specific screen. */
export function isTargetedScreenFeedback(feedback: ReviewFeedback[]): boolean {
  return feedback.length > 0 && feedback.every((item) => item.screen !== undefined);
}

/**
 * Upgrade legacy stored feedback (plain strings, sometimes JSON-encoded screen
 * feedback) to the structured shape. Called ONLY at the storage boundary — nothing
 * past it ever sees a string. Delete once no dev review predates the structured shape.
 */
export function normalizeReviewFeedback(stored: unknown[]): ReviewFeedback[] {
  return stored.flatMap((item): ReviewFeedback[] => {
    const structured = ReviewFeedbackItem.safeParse(item);
    if (structured.success) return [structured.data];
    if (typeof item !== "string") return [];
    try {
      const legacy = JSON.parse(item) as {
        screenId?: string;
        pageTitle?: string;
        comment?: string;
      };
      if (legacy.screenId && legacy.pageTitle && legacy.comment) {
        return [
          {
            comment: legacy.comment,
            screen: { screenId: legacy.screenId, pageTitle: legacy.pageTitle },
          },
        ];
      }
    } catch {
      // Plain human text, not JSON.
    }
    return [{ comment: item }];
  });
}

/**
 * Live progress of a design run: one entry per screen, moved through
 * queued → generating → ready by the worker. This is STATE with a schema —
 * the dashboard renders it directly and never reconstructs progress from logs.
 */
export const DESIGN_SCREEN_STATUSES = ["queued", "generating", "ready"] as const;

export type DesignScreenStatus = (typeof DESIGN_SCREEN_STATUSES)[number];

export interface DesignScreenProgress {
  pageTitle: string;
  pagePath: string;
  status: DesignScreenStatus;
  screenshotStorageId?: string;
}

/** The collaboration queue. Serialized by the worker's lease, so merge conflicts
 *  are structurally impossible and conflict resolution never needs to exist. */
export const CHANGE_REQUEST_STATUSES = ["queued", "running", "done", "failed"] as const;

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export type PublishTarget = "wix-managed" | "custom";

export const ClarifyingQuestionSet = z.object({
  round: z.number().int().min(1).describe("One-based adaptive interview round"),
  phase: z
    .enum(["business", "workflows", "architecture"])
    .describe("The kind of uncertainty this round resolves"),
  contextSummary: z
    .string()
    .describe("One concise sentence explaining what is understood and what this round focuses on"),
  readyForPlanning: z
    .boolean()
    .describe("True only when no material business or visitor-workflow ambiguity remains"),
  questions: z
    .array(
      z.object({
        id: z.string().describe("Stable short identifier, lowercase snake_case"),
        category: z
          .enum([
            "business",
            "audience",
            "content",
            "commerce",
            "scheduling",
            "workflows",
            "communications",
            "accounts",
            "operations",
            "launch",
          ])
          .describe("Planning area affected by the answer"),
        prompt: z.string().describe("One concise question phrased in Wix vocabulary"),
        rationale: z
          .string()
          .describe("Short plain-language explanation of what site decision this answer affects"),
        options: z
          .array(
            z.object({
              id: z.string().describe("Stable short option identifier"),
              label: z.string().describe("Short user-facing answer label"),
            }),
          )
          .min(2)
          .max(4),
        allowCustom: z.boolean().describe("Whether a free-text answer is genuinely useful"),
      }),
    )
    .max(12),
});

export const ClarifyingAnswerSet = z.object({
  answers: z.array(z.object({ questionId: z.string(), value: z.string() })),
});

export type QuestionSet = z.infer<typeof ClarifyingQuestionSet>;
export type ClarifyingQuestion = QuestionSet["questions"][number];
export type AnswerSet = z.infer<typeof ClarifyingAnswerSet>;

export const BusinessRequirements = z.object({
  summary: z.string().describe("Concise description of the business and the website's job"),
  audiences: z.array(
    z.object({
      name: z.string(),
      needs: z.array(z.string()),
    }),
  ),
  goals: z.array(z.string()).describe("Prioritized business outcomes for the website"),
  contentResponsibilities: z.array(
    z.object({
      content: z.string(),
      owner: z.enum(["siteTeam", "visitor", "wixBusinessSolution", "generated"]),
      updateFrequency: z.enum(["rarely", "occasionally", "frequently", "transactional"]),
    }),
  ),
  journeys: z.array(
    z.object({
      id: z.string().describe("Stable lowercase snake_case identifier"),
      name: z.string(),
      actor: z.string(),
      trigger: z.string(),
      steps: z.array(z.string()),
      dynamicContext: z.array(z.string()),
      businessOutcomes: z.array(z.string()),
      dataCaptured: z.array(z.string()),
      ownerOperations: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
    }),
  ),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export type Requirements = z.infer<typeof BusinessRequirements>;

export const WixCapabilitySnapshot = z.object({
  researchedAt: z.string(),
  capabilities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["available", "limited", "unavailable", "not_researched"]),
      headlessFit: z.enum(["native", "custom_workflow", "dashboard_only", "unsuitable"]),
      relevantJourneyIds: z.array(z.string()),
      sdkPackages: z.array(z.string()),
      operations: z.array(z.string()),
      limitations: z.array(z.string()),
      manualPrerequisites: z.array(z.string()),
      evidence: z.array(
        z.object({
          url: z.string(),
          title: z.string(),
          retrievedAt: z.string(),
          excerpt: z.string(),
        }),
      ),
    }),
  ),
  unresolvedResearch: z.array(z.string()),
});

export type CapabilitySnapshot = z.infer<typeof WixCapabilitySnapshot>;

export const WixSolutionArchitecture = z.object({
  summary: z.string(),
  businessSolutions: z.array(z.string()),
  journeySolutions: z.array(
    z.object({
      journeyId: z.string(),
      testPath: z.string().describe("Exact site route where this visitor journey is exercised"),
      browserTest: z
        .object({
          kind: z
            .enum(["interaction", "content", "none"])
            .describe(
              "interaction for a public control/form, content for a passive public experience, none for dashboard/system work",
            ),
          path: z
            .string()
            .nullable()
            .describe("Exact public route or dynamic route pattern; null only when kind is none"),
        })
        .nullable()
        .describe("Structured browser verification contract; null only for older saved artifacts"),
      pattern: z.string(),
      rationale: z.string(),
      wixCapabilities: z.array(z.string()),
      frontendResponsibilities: z.array(z.string()),
      backendResponsibilities: z.array(z.string()),
      dataFlow: z.array(z.string()),
      rejectedAlternatives: z.array(
        z.object({
          pattern: z.string(),
          reason: z.string(),
        }),
      ),
      requiredConfiguration: z.array(
        z.object({
          key: z.string(),
          description: z.string(),
          canAutomate: z.boolean(),
          valueSource: z
            .enum(["wixDashboard", "visitorInput", "pageContext", "siteData", "generated"])
            .nullable()
            .describe(
              "Where the runtime value originates. Null only when reading an older saved artifact.",
            ),
        }),
      ),
      triggeredEmail: z
        .object({
          templateIdConfigurationKey: z
            .string()
            .describe("Configuration key containing the published Wix Email ID"),
          variables: z.array(
            z.object({
              name: z.string().describe("Exact case-sensitive variable name created in Wix"),
              description: z.string().describe("What the variable displays in the email"),
              valueSource: z.enum(["visitorInput", "pageContext", "siteData", "generated"]),
            }),
          ),
        })
        .nullable()
        .describe("Exact Wix template contract for sendTriggeredEmail journeys; null otherwise"),
      acceptanceTests: z.array(z.string()),
    }),
  ),
  cmsCollections: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      justification: z.string(),
    }),
  ),
  risks: z.array(z.string()),
});

export type SolutionArchitecture = z.infer<typeof WixSolutionArchitecture>;

export const IMPLEMENTATION_UNIT_KINDS = [
  "foundation",
  "data",
  "solution",
  "workflow",
  "screen",
  "change",
] as const;

/**
 * The durable build graph for one approved specification + design pair. Units are
 * intentionally small enough for the coding agent to implement and verify without
 * carrying the entire website as one prompt.
 */
export const WebsiteImplementationPlan = z.object({
  planHash: z.string(),
  source: z.object({
    specificationVersion: z.number().int().positive(),
    designVersion: z.number().int().positive(),
    changeRequestId: z.string().nullable(),
  }),
  units: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(IMPLEMENTATION_UNIT_KINDS),
      title: z.string(),
      task: z.string(),
      screenPaths: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
    }),
  ),
});

export type ImplementationPlan = z.infer<typeof WebsiteImplementationPlan>;
export type ImplementationUnit = ImplementationPlan["units"][number];

export const WEBSITE_QA_CHECK_KINDS = ["route", "workflow"] as const;

/** Deterministic executable checks derived from approved pages and visitor journeys. */
export const WebsiteQaPlan = z.object({
  planHash: z.string(),
  source: z.object({
    specificationVersion: z.number().int().positive(),
    architectureVersion: z.number().int().positive(),
    previewVersion: z.number().int().positive(),
  }),
  checks: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(WEBSITE_QA_CHECK_KINDS),
      title: z.string(),
      path: z.string(),
      journeyId: z.string().nullable(),
      workflowActions: z.array(z.string()),
      expectations: z.array(z.string()),
      execution: z.enum(["route", "interaction", "content", "absent"]),
    }),
  ),
});

export type QaPlan = z.infer<typeof WebsiteQaPlan>;
export type QaPlanCheck = QaPlan["checks"][number];

export const WEBSITE_QA_CHECK_STATUSES = ["passed", "repaired", "failed"] as const;

export const WebsiteQaReport = z.object({
  planHash: z.string(),
  previewUrl: z.string().url(),
  status: z.enum(["passed", "repaired", "needs_attention"]),
  repairAttempts: z.number().int().nonnegative(),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    repaired: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      status: z.enum(WEBSITE_QA_CHECK_STATUSES),
      evidence: z.array(z.string()),
      failures: z.array(z.string()),
      screenshotStorageId: z.string().nullable(),
    }),
  ),
});

export type QaReport = z.infer<typeof WebsiteQaReport>;

/** Durable checkpoint written only after one unit passed verification and reached GitHub. */
export const ImplementationUnitCheckpoint = z.object({
  kind: z.literal("implementationUnit"),
  ok: z.literal(true),
  planHash: z.string(),
  unitIndex: z.number().int().nonnegative(),
  unitId: z.string(),
  unitTitle: z.string(),
  summary: z.string(),
  model: z.string(),
  initialBaseRevision: z.string(),
  revision: z.string(),
  checks: z.array(z.string()),
});

export const DESIGN_VIEWPORTS = ["desktop", "mobile", "tablet"] as const;

export const ProjectDesign = z.object({
  stitchProjectId: z.string(),
  screens: z.array(
    z.object({
      pageTitle: z.string(),
      pagePath: z.string(),
      viewport: z.enum(DESIGN_VIEWPORTS),
      stitchScreenId: z.string(),
      htmlStorageId: z.string(),
      screenshotStorageId: z.string(),
    }),
  ),
});

export type Design = z.infer<typeof ProjectDesign>;
export type DesignViewport = (typeof DESIGN_VIEWPORTS)[number];

// TODO(phase-4): the Design shape (Stitch screens: HTML + screenshot per screen).

/**
 * The Wix business solutions we can actually turn on. A closed set, not free text.
 *
 * The model must pick from these, because every value here maps to a real Wix product
 * we can provision in Phase 5. Left as `z.string()` the model will happily invent
 * "Wix Loyalty Suite", and we would not discover it until provisioning failed.
 */
export const WIX_BUSINESS_SOLUTIONS = [
  "stores",
  "bookings",
  "events",
  "blog",
  "members",
  "forms",
  "pricingPlans",
] as const;

/**
 * What a section on a page IS, not just what it says.
 *
 * The design stage and the code stage both key off this. A free-text description is
 * something only a human can act on; a `type` is something the pipeline can.
 */
export const SECTION_TYPES = [
  "hero",
  "about",
  "features",
  "gallery",
  "productList",
  "bookingList",
  "blogFeed",
  "testimonials",
  "pricing",
  "faq",
  "contactForm",
  "cta",
  "map",
  "richText",
] as const;

/** Wix CMS field types. Again closed, so the collection is actually creatable. */
export const CMS_FIELD_TYPES = [
  "text",
  "richText",
  "number",
  "boolean",
  "date",
  "image",
  "url",
  "reference",
] as const;

/**
 * The specification: what we are going to build, before we build it.
 *
 * This schema does double duty. It is the TypeScript type the worker and the dashboard
 * share, AND it is handed to the model as a JSON schema, so the model is *structurally
 * incapable* of returning something we cannot parse. That is why the `.describe()`
 * calls matter — they are not comments, they are prompt surface. The model reads them.
 *
 * ⚠️ NO `.optional()` ANYWHERE. OpenAI's strict structured outputs requires every field
 * to be present. `.nullable()` is the way to say "may have no value" — it means "must be
 * there, may be null", which is what strict mode wants. This is a provider constraint,
 * not an SDK one, so switching to Gemini would not lift it either.
 */
export const ProjectSpecification = z.object({
  summary: z
    .string()
    .describe(
      "What the business is, what it sells or offers, and who its customers are. " +
        "Two or three sentences, in the owner's own terms.",
    ),

  pages: z
    .array(
      z.object({
        title: z.string().describe("The page name as it appears in navigation, e.g. 'About'"),
        path: z
          .string()
          .describe("URL path, lowercase, starting with a slash. The home page is '/'."),
        description: z.string().describe("What this page is for and what a visitor does on it"),
        sections: z
          .array(
            z.object({
              type: z.enum(SECTION_TYPES).describe("The kind of section this is"),
              description: z
                .string()
                .describe(
                  "What this specific section contains for THIS business — real content " +
                    "intent, not a generic placeholder.",
                ),
            }),
          )
          .describe("The sections of the page, in the order they appear top to bottom"),
      }),
    )
    .describe("Every page on the site, starting with the home page"),

  infrastructure: z.object({
    cmsCollections: z
      .array(
        z.object({
          name: z.string().describe("Collection name, e.g. 'Workshops'"),
          description: z.string().describe("What this collection stores and why"),
          fields: z.array(
            z.object({
              name: z.string(),
              type: z.enum(CMS_FIELD_TYPES),
              description: z.string().nullable().describe("Null if self-explanatory"),
              referencedCollection: z
                .string()
                .nullable()
                .describe(
                  "Exact target collection name for reference fields; null for every other type",
                ),
            }),
          ),
        }),
      )
      .describe(
        "Wix CMS collections this site needs for its own custom content. Do NOT model " +
          "anything a Wix business solution already provides — products belong to Stores, " +
          "bookable services to Bookings, posts to Blog. Empty array if none are needed.",
      ),

    wixBusinessSolutions: z
      .array(z.enum(WIX_BUSINESS_SOLUTIONS))
      .describe(
        "Only the solutions this site genuinely needs. Selling physical goods → stores. " +
          "Appointments or classes → bookings. Do not add one 'just in case' — each is " +
          "real setup work for the owner.",
      ),

    visitorWorkflows: z
      .array(
        z.object({
          id: z.string().describe("Stable lowercase snake_case workflow identifier"),
          name: z.string().describe("Short user-facing workflow name"),
          description: z.string().describe("What the visitor accomplishes end to end"),
          dynamicContext: z
            .string()
            .nullable()
            .describe(
              "Current page or content context used by the workflow, such as the current course; null when static",
            ),
          inputs: z.array(
            z.object({
              name: z.string(),
              type: z.enum(["text", "email", "phone", "textarea", "select", "checkbox"]),
              required: z.boolean(),
              source: z.enum(["visitor", "currentPage", "siteData"]),
              description: z.string(),
            }),
          ),
          actions: z.array(
            z.object({
              type: z.enum([
                "createOrUpdateContact",
                "saveFormSubmission",
                "sendTriggeredEmail",
                "notifySiteTeam",
                "createCmsItem",
                "startCheckout",
                "createBooking",
              ]),
              description: z.string().describe("The business result and data used by this action"),
              requiresManualSetup: z
                .boolean()
                .describe("True only when Wix requires dashboard configuration or owner content"),
              requiredConfiguration: z
                .array(
                  z.object({
                    key: z.string().describe("Stable camelCase configuration key used by code"),
                    description: z
                      .string()
                      .describe("The exact value needed and where it comes from"),
                    valueSource: z
                      .enum([
                        "wixDashboard",
                        "visitorInput",
                        "pageContext",
                        "siteData",
                        "generated",
                      ])
                      .nullable()
                      .describe(
                        "Where the value comes from. Null only when reading an older saved artifact.",
                      ),
                  }),
                )
                .describe(
                  "Runtime IDs or owner-provided values needed by this action, such as a published triggered-email ID; empty when none",
                ),
            }),
          ),
          successResult: z.string().describe("What the visitor sees after the workflow succeeds"),
        }),
      )
      .describe(
        "Every visitor interaction with business effects, described as inputs, dynamic context, and ordered outcomes. " +
          "Do not assume visible inputs imply Wix Forms: choose saveFormSubmission only when the Forms inbox/schema is itself required.",
      ),
  }),
});

/** The shared type. Worker produces it, dashboard renders it, the model is constrained to it. */
export type Specification = z.infer<typeof ProjectSpecification>;

/** Read artifacts created before CMS reference targets were explicit. */
export function parseProjectSpecification(value: unknown): Specification {
  if (!value || typeof value !== "object") return ProjectSpecification.parse(value);
  const copy = JSON.parse(JSON.stringify(value)) as {
    infrastructure?: {
      cmsCollections?: Array<{ fields?: Array<Record<string, unknown>> }>;
      visitorWorkflows?: Array<{
        actions?: Array<{
          type?: string;
          requiredConfiguration?: Array<Record<string, unknown>>;
        }>;
      }>;
    };
  };
  for (const collection of copy.infrastructure?.cmsCollections ?? []) {
    for (const field of collection.fields ?? []) {
      if (!("referencedCollection" in field)) field.referencedCollection = null;
    }
  }
  copy.infrastructure ??= {};
  copy.infrastructure.visitorWorkflows ??= [];
  for (const workflow of copy.infrastructure.visitorWorkflows) {
    for (const action of workflow.actions ?? []) {
      for (const configuration of action.requiredConfiguration ?? []) {
        if (!("valueSource" in configuration)) {
          configuration.valueSource =
            action.type === "sendTriggeredEmail" && configuration.key === "triggeredEmailTemplateId"
              ? "wixDashboard"
              : "generated";
        }
      }
    }
  }
  return ProjectSpecification.parse(copy);
}

/** Read architecture artifacts created before configuration sources were explicit. */
export function parseWixSolutionArchitecture(value: unknown): SolutionArchitecture {
  if (!value || typeof value !== "object") return WixSolutionArchitecture.parse(value);
  const copy = JSON.parse(JSON.stringify(value)) as {
    journeySolutions?: Array<{
      browserTest?: unknown;
      triggeredEmail?: unknown;
      testPath?: unknown;
      requiredConfiguration?: Array<Record<string, unknown>>;
    }>;
  };
  for (const journey of copy.journeySolutions ?? []) {
    if (!("browserTest" in journey)) journey.browserTest = null;
    if (!("triggeredEmail" in journey)) journey.triggeredEmail = null;
    if (!("testPath" in journey)) journey.testPath = "/";
    for (const configuration of journey.requiredConfiguration ?? []) {
      if (!("valueSource" in configuration)) {
        configuration.valueSource =
          configuration.key === "triggeredEmailTemplateId" ? "wixDashboard" : "generated";
      }
    }
  }
  return WixSolutionArchitecture.parse(copy);
}
export type WixBusinessSolution = (typeof WIX_BUSINESS_SOLUTIONS)[number];
export type SectionType = (typeof SECTION_TYPES)[number];
