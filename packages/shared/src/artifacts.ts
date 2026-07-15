/**
 * Artifacts are append-only and versioned. Never overwrite — always add a version.
 * `Specification v1, v2, v3…` is the whole point: every generated output is
 * immutable, and rejection produces a new version rather than mutating the old one.
 */

import z from "zod";

export const ARTIFACT_TYPES = [
  "brief",
  "specification",
  "design",
  "buildReport",
  "preview",
  "releaseReport",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const REVIEW_STATUSES = [
  "waiting",
  "approved",
  "rejected",
  "needs_changes",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The collaboration queue. Serialized by the worker's lease, so merge conflicts
 *  are structurally impossible and conflict resolution never needs to exist. */
export const CHANGE_REQUEST_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export type PublishTarget = "wix-managed" | "custom";

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
        description: z
          .string()
          .describe("What this page is for and what a visitor does on it"),
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
  }),
});

/** The shared type. Worker produces it, dashboard renders it, the model is constrained to it. */
export type Specification = z.infer<typeof ProjectSpecification>;
export type WixBusinessSolution = (typeof WIX_BUSINESS_SOLUTIONS)[number];
export type SectionType = (typeof SECTION_TYPES)[number];
