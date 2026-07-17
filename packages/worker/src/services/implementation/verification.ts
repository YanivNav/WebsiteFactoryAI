import type { ImplementationUnit, Specification } from "@factory/shared";
import type { Workspace } from "../../workspace";
import type { WixSiteResources } from "../wix";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generatedSources(workspace: Workspace) {
  const sourceFiles = (await workspace.glob("src/**/*")).filter((file) =>
    /\.(astro|js|jsx|ts|tsx)$/.test(file),
  );
  const sources = await Promise.all(
    sourceFiles.map(async (file) => ({ file, content: await workspace.readFile(file) })),
  );
  return { sourceFiles, sources };
}

function findForbiddenVisibleBehavior(sources: Array<{ file: string; content: string }>) {
  const visibleSources = sources
    .filter(({ file }) => /\.(astro|jsx|tsx)$/.test(file) && !file.includes("/api/"))
    .map(({ content }) => content)
    .join("\n");
  const placeholder = visibleSources.match(
    /(?:not configured yet|awaiting (?:wix )?configuration|configuration is missing|contact .* for (?:a|your) copy)/i,
  );
  if (placeholder) return `placeholder behavior: ${placeholder[0]}`;
  const inlineSubmitHandler = sources.find(
    ({ file, content }) =>
      file.endsWith(".astro") &&
      /<script(?:\s|>)/.test(content) &&
      /addEventListener\(\s*["']submit["']/.test(content),
  );
  return inlineSubmitHandler ? `an inline form handler in ${inlineSubmitHandler.file}` : null;
}

function validateCmsDataAccess(
  sourceFiles: string[],
  combined: string,
  resources: WixSiteResources,
  prefix: string,
) {
  if (resources.cmsCollections.length === 0) return;
  if (!combined.includes("@wix/data") || !combined.includes("items.query")) {
    throw new Error(`${prefix} does not implement Wix CMS queries`);
  }
  for (const collection of resources.cmsCollections) {
    const collectionLiteral = new RegExp(`["']${escapeRegExp(collection.id)}["']`);
    if (!collectionLiteral.test(combined)) {
      throw new Error(`${prefix} does not query ${collection.displayName}`);
    }
    const fixtureName = collection.id.toLowerCase().replace(/[^a-z0-9]/g, "");
    const fixture = sourceFiles.find((file) => {
      const basename =
        file
          .split("/")
          .at(-1)
          ?.replace(/\.[^.]+$/, "")
          .toLowerCase() ?? "";
      return file.startsWith("src/data/") && basename.replace(/[^a-z0-9]/g, "") === fixtureName;
    });
    if (fixture) throw new Error(`${collection.displayName} was replaced with ${fixture}`);
  }
}

function validateVisitorContactCapture(combined: string, prefix: string) {
  const importsSubmittedContact =
    /import\s*\{[^}]*\bsubmittedContact\b[^}]*\}\s*from\s*["']@wix\/crm["']/.test(combined);
  const elevatesSubmission =
    /auth\s*\.\s*elevate\s*\(\s*submittedContact\s*\.\s*appendOrCreateContact\s*\)/.test(combined);
  if (!importsSubmittedContact || !combined.includes("submittedContact.appendOrCreateContact")) {
    throw new Error(`${prefix} does not use the Wix submitted-contact API correctly`);
  }
  if (!elevatesSubmission) {
    throw new Error(`${prefix} does not authenticate Wix contact submission with the site app`);
  }
}

export async function validateImplementationUnit(
  workspace: Workspace,
  resources: WixSiteResources,
  specification: Specification,
  unit: ImplementationUnit,
) {
  const { sourceFiles, sources } = await generatedSources(workspace);
  const combined = sources.map((source) => source.content).join("\n");

  if (
    (unit.kind === "screen" || unit.kind === "change") &&
    combined.includes("googleusercontent.com")
  ) {
    throw new Error(`${unit.title} still hotlinks temporary Google design images`);
  }
  if (unit.kind === "screen" || unit.kind === "workflow" || unit.kind === "change") {
    const forbiddenBehavior = findForbiddenVisibleBehavior(sources);
    if (forbiddenBehavior) throw new Error(`${unit.title} contains ${forbiddenBehavior}`);
  }

  if (unit.kind === "data") {
    validateCmsDataAccess(sourceFiles, combined, resources, "The Wix content-data unit");
  }

  if (unit.kind === "workflow") {
    const workflowId = unit.id.replace(/^workflow-/, "");
    const workflow = specification.infrastructure.visitorWorkflows.find(
      (candidate) =>
        candidate.id
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") === workflowId,
    );
    if (!workflow) throw new Error(`Could not resolve the ${unit.title} workflow`);
    const actions = new Set(workflow.actions.map((action) => action.type));
    if (actions.has("createOrUpdateContact"))
      validateVisitorContactCapture(combined, workflow.name);
    if (actions.has("sendTriggeredEmail") && !combined.includes("emailContact")) {
      throw new Error(`${workflow.name} does not send the required triggered email`);
    }
    if (actions.has("saveFormSubmission") && resources.formsMode === "wixForms") {
      if (!combined.includes("@wix/forms") || !combined.includes("createSubmission")) {
        throw new Error(`${workflow.name} does not save its Wix Forms submission`);
      }
    }
  }
}

export async function validateGeneratedIntegrations(
  workspace: Workspace,
  resources: WixSiteResources,
  specification: Specification,
) {
  const { sourceFiles, sources } = await generatedSources(workspace);
  const combined = sources.map((source) => source.content).join("\n");

  if (combined.includes("googleusercontent.com")) {
    throw new Error("Generated site still hotlinks temporary Google design images");
  }
  const forbiddenBehavior = findForbiddenVisibleBehavior(sources);
  if (forbiddenBehavior) throw new Error(`Generated site contains ${forbiddenBehavior}`);
  validateCmsDataAccess(sourceFiles, combined, resources, "Generated site");

  if (resources.forms.length > 0) {
    if (!combined.includes("@wix/forms")) {
      throw new Error("Generated site contains forms but does not connect them to Wix Forms");
    }
    if (!combined.includes("submissions.createSubmission")) {
      throw new Error("Generated site forms do not save submissions to Wix");
    }
    if (!combined.includes("client:load")) {
      throw new Error("Generated site forms are not interactive in the browser");
    }
  }

  const workflowActions = new Set(
    specification.infrastructure.visitorWorkflows.flatMap((workflow) =>
      workflow.actions.map((action) => action.type),
    ),
  );
  const requiresCustomContactCapture =
    resources.formsMode === "customCrm" && workflowActions.has("saveFormSubmission");
  if (workflowActions.has("createOrUpdateContact") || requiresCustomContactCapture) {
    validateVisitorContactCapture(combined, "Generated site");
  }
  if (workflowActions.has("sendTriggeredEmail") && !combined.includes("emailContact")) {
    throw new Error("Generated site does not send the required triggered email");
  }
}

export async function formatGeneratedSource(workspace: Workspace) {
  const result = await workspace.exec("pnpm", [
    "exec",
    "prettier",
    "--plugin=prettier-plugin-astro",
    "--write",
    "src/**/*.{astro,css,js,jsx,json,ts,tsx}",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Could not format the generated site files");
  }
}
