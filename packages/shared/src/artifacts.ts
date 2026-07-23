import { z } from "zod";

export const ARTIFACT_TYPES = [
  "brief",
  "questionnaire",
  "questionnaireResponse",
  "specification",
  "design",
  "wixSetupPlan",
  "wixSetupDecision",
  "wixProject",
  "siteBuild",
  "siteRelease",
  "manualTasks",
  "qaPlan",
  "qaResult",
  "websiteContent",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

const artifactTypeMap = {
  brief: {} as string,
  questionnaire: {} as Questionnaire,
  questionnaireResponse: {} as QuestionnaireResponse,
  specification: {} as Specification,
  design: {} as Design,
  wixSetupPlan: {} as WixSetupPlan,
  wixSetupDecision: {} as WixSetupDecision,
  wixProject: {} as WixProject,
  siteBuild: {} as SiteBuild,
  siteRelease: {} as SiteRelease,
  manualTasks: {} as ManualTasks,
  qaPlan: {},
  qaResult: {},
  websiteContent: {} as WebsiteContent,
} satisfies Record<ArtifactType, unknown>;

type ArtifactTypeMap = typeof artifactTypeMap;

export type ArtifactData<T extends keyof ArtifactTypeMap> = ArtifactTypeMap[T];

export interface Artifact<T extends ArtifactType = any> {
  id: string;
  type: T;
  data: ArtifactData<T>;
  version: number;
  basedOnArtifactId?: string;
  createdByWorkId?: string;
  createdByUserTaskId?: string;
  assets: Asset[];
}

export interface Asset {
  id: string;
  data: any;
  url: string | null;
  storageId: string;
}

export const QuestionDefinitionSchema = z.object({
  id: z.number().describe("A one-based question index"),
  category: z
    .enum(["content", "workflows", "business", "ui", "auth"])
    .describe("The category this question relates to"),
  prompt: z
    .string()
    .describe(
      "The question body, in a concise, non-technical phrasing. Using Wix related terms is fine",
    ),
  rationale: z
    .string()
    .describe("Short explanation to the user of what decision this answer affects"),
  options: z
    .array(z.string())
    .min(1)
    .nullable()
    .describe(
      "Answer options as short user-facing labels, grounded in this specific project — never generic examples that do not apply. " +
        "If isList is true you MUST provide your best proposed list here (non-empty) for the user to edit. " +
        "Leave null only for a pure open-ended question that has no sensible starting options.",
    ),
  allowFreeText: z
    .boolean()
    .describe(
      "Whether a free text answer is allowed. Set true whenever your options might not cover the correct answer " +
        "(i.e. you are guessing at them), and always for open-ended questions. Only set false when the options are genuinely exhaustive, such as a yes/no or a closed factual choice.",
    ),
  isList: z
    .boolean()
    .describe(
      "True if the answer is a list of items, for example a list of pages, form fields, or CMS collections. " +
        "When true, options MUST contain your proposed starting list.",
    ),
});

export const QuestionnaireSchema = z.object({
  questions: z.array(QuestionDefinitionSchema).max(10),
});

export const QuestionnaireResponseSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number(),
      value: z.string(),
    }),
  ),
});

export type QuestionDefinition = z.infer<typeof QuestionDefinitionSchema>;
export type Questionnaire = z.infer<typeof QuestionnaireSchema>;
export type QuestionnaireResponse = z.infer<typeof QuestionnaireResponseSchema>;

export const PageSchema = z.object({
  name: z.string().describe("The name of the page"),
  browserTitle: z
    .string()
    .describe("The title of the web page (or the template in case of a dynamic page)"),
  path: z.string().describe('URL path, lowercase, starting with a /. Home page is just "/".'),
  description: z
    .string()
    .describe("What this page is for, what the visitor can see in it or do in it."),
  sections: z.array(
    z.object({
      type: z.enum([
        "hero",
        "cards",
        "table",
        "gallery",
        "blog",
        "form",
        "map",
        "share",
        "video",
        "image",
      ]),
      description: z.string(),
      data: z
        .object({
          info: z.string(),
          collection: z.string(),
          sorting: z.string(),
          filters: z.string(),
        })
        .nullable()
        .describe(
          "Information about dynamic data that should be fetched from a collection and be displayed in this component",
        ),
      itemContent: z
        .string()
        .describe(
          "Explanation of the structure, information and functionality of a single item in this section " +
            "if it displays multiple items, like cards, table, gallery.",
        ),
      formStructure: z.object({
        type: z
          .enum(["wix-forms", "custom"])
          .describe(
            "The type of form. wix forms cannot have dynamic values and are harder to perform custom submit actions on",
          ),
        fields: z.array(
          z.object({
            name: z.string(),
            type: z.enum([
              "text",
              "email",
              "phone",
              "number",
              "checkbox",
              "select",
              "checkbox-group",
              "radio-group",
              "file-upload",
              "address",
              "password",
            ]),
            description: z.string(),
            options: z
              .union([
                z.object({
                  type: z.literal("dynamic"),
                  collection: z.string().describe("The collection ID to use to fill this select"),
                  description: z.string().describe("An explanation of what data it fetches"),
                }),
                z.object({
                  type: z.literal("static"),
                  values: z.array(z.string()).describe("A list of static options"),
                }),
              ])
              .nullable()
              .describe(
                "A value describing the options of a select. For selects using dynamic data, use the dynamic type. " +
                  "Otherwise, use the static type. Leave null if the options should be provided later by the owner, or if you don't know what are the options.",
              ),
          }),
        ),
      }),
      isOwnerContent: z
        .boolean()
        .describe(
          "Whether this section holds content that should be filled by the owner, and the owner should provide. " +
            "When true, the section should have placeholder data until the owner provides it. If it's a section filled by data from a collection, set this to false.",
        ),
    }),
  ),
  dynamicPage: z.object({
    collectionId: z.string(),
    editMode: z.boolean().describe("Whether this dynamic page is for editing the current item"),
    urlTemplate: z
      .string()
      .describe(
        "The template of the page url, in the format /items/{field}, where field is a name of a field from the collection.",
      ),
  }),
});

export type SpecPage = z.infer<typeof PageSchema>;

export const SpecificationSchema = z.object({
  summary: z
    .string()
    .describe(
      "A paragraph explaining the website in general: what is it about, what it provides...",
    ),
  audience: z.string().describe("Describes the target audience: Who is this website for?"),
  businessModel: z.object({
    revenue: z.string(),
    goals: z.string(),
  }),
  homePage: PageSchema.describe("A detailed specification of the home page"),
  pages: z
    .array(PageSchema)
    .describe(
      "Specifications of all other pages, including dynamic pages, hidden pages, landing pages",
    ),
  header: z.string().describe("A description of what exists in the site header"),
  footer: z.string().describe("A description of what exists in the site footer"),
  design: z.object({
    colors: z.array(z.string()),
    mainFont: z.string().nullable(),
    feel: z.string(),
  }),
  languages: z.array(z.string()),

  businessSolutions: z
    .object({
      cms: z
        .object({
          collections: z.array(
            z.object({
              name: z.string().describe("The name of the collection"),
              id: z
                .string()
                .describe(
                  "The collection ID. must be an alphanumeric ID - preferably similar to the collection name",
                ),
              fields: z.array(
                z.object({
                  id: z.string().describe("Alphanumeric field ID"),
                  name: z.string().describe("Field display name"),
                  type: z.union([
                    z.object({
                      kind: z.literal("simple"),
                      typeName: z
                        .string()
                        .describe("The field type. Must be a valid type of field supported by wix"),
                    }),
                    z
                      .object({
                        kind: z.literal("reference"),
                        multi: z.boolean().describe("Whether this field references multiple items"),
                        collectionId: z
                          .string()
                          .describe("The collection ID this field references"),
                      })
                      .describe("Defines a reference field, a reference to another collection"),
                  ]),
                }),
              ),
            }),
          ),
        })
        .nullable()
        .describe(
          "Wix CMS: the collections that store the site's repeating content. Null if unused.",
        ),
      stores: z
        .object({
          categories: z.array(z.string()),
          productKinds: z.array(
            z.object({
              kind: z.string(),
              options: z.array(
                z.object({
                  name: z.string(),
                  type: z.enum(["list", "color"]),
                  values: z.array(z.string()),
                }),
              ),
              customTextFields: z.array(z.string()),
            }),
          ),
        })
        .nullable()
        .describe("Wix Stores: the product catalog structure. Null if unused."),
      others: z
        .array(
          z.object({
            name: z
              .string()
              .describe(
                "The Wix business solution or app, e.g. crm, bookings, forms, blog, pricingPlans, events, members — or any other not listed here",
              ),
            description: z
              .string()
              .describe("How and where this business solution is used on the site"),
          }),
        )
        .describe(
          "Any other Wix business solutions the site uses beyond CMS and Stores, each as a name + description. Empty array if none.",
        ),
    })
    .describe(
      "The Wix business solutions the site uses. CMS and Stores carry structured detail; everything else is a name + description. Include only what the brief needs.",
    ),

  visitorWorkflows: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      steps: z.array(
        z.object({
          description: z.string(),
          action: z.union([
            z.object({
              actor: z.literal("visitor"),
              type: z.enum(["goToPage", "selectFromDropdown", "fillForm", "pressButton"]),
            }),
            z.object({
              actor: z.literal("frontendCode"),
              type: z.enum([
                "fetchData",
                "changeFilter",
                "updateElement",
                "callBackend",
                "navigateToPage",
                "addToCart",
              ]),
            }),
            z.object({
              actor: z.literal("backendCode"),
              type: z.enum([
                "createCmsItem",
                "editCmsItem",
                "deleteCmsItem",
                "sendTriggeredEmail",
                "callExternalAPI",
                "sendAdminEmail",
                "createContact",
              ]),
            }),
          ]),
          requiresManualSetup: z
            .boolean()
            .describe("True if this step requires manual setup in the wix dashboard to work"),
        }),
      ),
      result: z.string().describe("What the visitor sees after the workflow succeeds"),
    }),
  ),
});

export type Specification = z.infer<typeof SpecificationSchema>;

// A generated design: one screen per site page. The HTML and screenshot for each
// screen live in Convex file storage as artifact assets; the document only holds
// references to them by asset id.
export const DesignScreenSchema = z.object({
  name: z.string().describe("The screen's page name"),
  path: z.string().describe("The URL path of the page this screen designs"),
  deviceType: z.enum(["desktop", "mobile"]),
  prompt: z
    .string()
    .optional()
    .describe("The visual-design prompt that produced this screen, kept for revisions"),
  htmlAssetId: z.string().describe("Asset id of the screen's HTML blob"),
  imageAssetId: z.string().describe("Asset id of the screen's screenshot blob"),
});
export const DesignSchema = z.object({
  screens: z.array(DesignScreenSchema),
  stitchProjectId: z.string().optional().describe("Google Stitch project ID, reused across revisions"),
});
export type DesignScreen = z.infer<typeof DesignScreenSchema>;
export type Design = z.infer<typeof DesignSchema>;

// ---------------------------------------------------------------------------
// Wix setup: hosting recommendation → user decision → provisioned project.
// ---------------------------------------------------------------------------

export const WIX_HOSTING_OPTIONS = ["wixManaged", "selfManaged"] as const;
export type WixHosting = (typeof WIX_HOSTING_OPTIONS)[number];

export const WIX_HOSTING_LABELS: Record<WixHosting, string> = {
  wixManaged: "Wix-managed",
  selfManaged: "Self-managed",
};

/** The AI's analysis of which hosting setup fits the approved site plan. */
export const WixSetupPlanSchema = z.object({
  recommendation: z.enum(WIX_HOSTING_OPTIONS),
  summary: z
    .string()
    .describe(
      "One short paragraph, in plain non-technical language, explaining the recommendation",
    ),
  factors: z
    .array(
      z.object({
        capability: z
          .string()
          .describe("A capability the site plan needs, e.g. 'Online store checkout'"),
        wixManaged: z.string().describe("How Wix-managed hosting handles this capability"),
        selfManaged: z.string().describe("How self-managed hosting handles this capability"),
        favors: z
          .enum([...WIX_HOSTING_OPTIONS, "either"])
          .describe("Which option handles this capability better"),
      }),
    )
    .describe("Only capabilities where the choice actually matters or the user should know"),
});
export type WixSetupPlan = z.infer<typeof WixSetupPlanSchema>;

/** The user's hosting choice, submitted from the setup review task. */
export const WixSetupDecisionSchema = z.object({
  hosting: z.enum(WIX_HOSTING_OPTIONS),
});
export type WixSetupDecision = z.infer<typeof WixSetupDecisionSchema>;

/** The provisioned Wix project: repository plus Wix site references. */
export const WixProjectSchema = z.object({
  hosting: z.enum(WIX_HOSTING_OPTIONS),
  folderName: z.string().describe("Checkout folder name under the workspaces root"),
  repository: z.object({
    owner: z.string(),
    name: z.string(),
    url: z.string(),
    defaultBranch: z.string(),
  }),
  wix: z.object({
    siteId: z.string().optional().describe("The Wix site / metasite id, when provisioned"),
    dashboardUrl: z
      .string()
      .optional()
      .describe("Derived from the real site id only — never fabricated"),
    liveUrl: z.string().optional(),
  }),
  /** Steps the factory could not automate; shown to the user on review. */
  pendingSetup: z
    .array(
      z.object({
        title: z.string(),
        instructions: z.string(),
        url: z.string().optional().describe("A documented, real URL only"),
      }),
    )
    .optional(),
});
export type WixProject = z.infer<typeof WixProjectSchema>;

// ---------------------------------------------------------------------------
// Site build: owner content, manual tasks/questions, build output, release.
// ---------------------------------------------------------------------------

/**
 * One-off owner content the generated code bakes in (the hybrid model's in-app
 * half; repeating/structured content lives in Wix CMS + Media Manager instead).
 * `assetId` points at a Convex-stored upload for image/logo kinds.
 */
export const WebsiteContentSchema = z.object({
  items: z.array(
    z.object({
      key: z.string().describe("Stable slot id the generated code reads, e.g. 'home.hero.title'"),
      label: z.string().describe("Human label shown in the content form"),
      /**
       * `setting` is a value the site needs to work (e.g. a Wix triggered-email
       * id) rather than page content. The owner just fills the field — the
       * factory puts it where the code reads it. Never ask them to edit env vars.
       */
      kind: z.enum(["text", "longtext", "image", "logo", "setting"]),
      page: z.string().optional().describe("Page path this content belongs to, for grouping"),
      placeholder: z.string().optional().describe("Placeholder value used until the owner provides one"),
      help: z.string().optional().describe("Plain-language instructions for how to get this value"),
      helpLink: z
        .string()
        .optional()
        .describe("Name of a known Wix dashboard destination; the factory resolves it to a real URL"),
      helpUrl: z.string().optional().describe("A real link to where the owner gets it"),
      value: z.string().nullable().describe("The owner's value; null means unfilled (use placeholder)"),
      assetId: z.string().optional().describe("Convex storage id of an uploaded image/logo"),
    }),
  ),
});
export type WebsiteContent = z.infer<typeof WebsiteContentSchema>;

/**
 * Things the build raised for the owner: questions that arose beyond the
 * questions phase, and genuinely-manual setup the factory could not automate
 * (payments, Premium, domain). `dashboardUrl` is derived from a real site id
 * only — never fabricated.
 */
export const ManualTasksSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["question", "manualTask"]),
      title: z.string(),
      detail: z.string(),
      dashboardUrl: z.string().optional(),
      status: z.enum(["open", "done"]),
    }),
  ),
});
export type ManualTasks = z.infer<typeof ManualTasksSchema>;

/** One iteration of the built site; each refine pass appends a new version. */
export const SiteBuildSchema = z.object({
  summary: z.string().describe("A short, plain-language description of what this build produced"),
  repoRevision: z.string().describe("The git commit the build pushed"),
  previewUrl: z.string().optional().describe("Shareable Wix preview URL for this build"),
  contentArtifactId: z.string().optional().describe("The websiteContent version this build baked in"),
  manualTasksArtifactId: z.string().optional().describe("The manualTasks version this build raised"),
  installedApps: z.array(z.string()).describe("Business-solution app ids installed for this site"),
  unitsBuilt: z.array(z.string()).describe("The build units completed, e.g. 'page:/about'"),
});
export type SiteBuild = z.infer<typeof SiteBuildSchema>;

/** The published site: the live URL from `wix release` (absent if it wasn't reported). */
export const SiteReleaseSchema = z.object({
  liveUrl: z.string().optional().describe("The live site URL, when publishing reported one"),
  repoRevision: z.string().describe("The git commit that was released"),
});
export type SiteRelease = z.infer<typeof SiteReleaseSchema>;
