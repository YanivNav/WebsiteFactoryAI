import { z } from "zod";

export const ARTIFACT_TYPES = [
  "brief",
  "questionnaire",
  "questionnaireResponse",
  "specification",
  "design",
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
  manualTasks: {},
  qaPlan: {},
  qaResult: {},
  websiteContent: {},
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
