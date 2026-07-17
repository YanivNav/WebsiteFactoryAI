import { chromium, type BrowserContext, type Page } from "playwright";
import type { QaPlan, QaPlanCheck } from "@factory/shared";

export interface BrowserQaCheckResult {
  id: string;
  title: string;
  path: string;
  passed: boolean;
  durationMs: number;
  evidence: string[];
  failures: string[];
  screenshot: Uint8Array;
}

export interface WebsiteQaService {
  run(
    plan: QaPlan,
    previewUrl: string,
    onCheck: (input: { index: number; total: number; title: string }) => Promise<void>,
  ): Promise<BrowserQaCheckResult[]>;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pathTemplatePattern(path: string): RegExp {
  const tokens = path.split(/(\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+)/g);
  const expression = tokens
    .map((token) =>
      /^(\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+)$/.test(token) ? "[^/]+" : escapeRegExp(token),
    )
    .join("");
  return new RegExp(`^${expression}/?$`);
}

function hasDynamicSegment(path: string) {
  return /(\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+)/.test(path);
}

function concreteFallback(path: string) {
  return path.replace(/\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+/g, "factory-qa");
}

export function dynamicDiscoveryPaths(path: string) {
  const tokenIndex = path.search(/\{[^}]+\}|\[[^\]]+\]|:[a-zA-Z0-9_]+/);
  if (tokenIndex === -1) return ["/"];
  const parent = path.slice(0, tokenIndex).replace(/\/+$/, "") || "/";
  return [...new Set([parent, "/"])];
}

function routeUrl(previewUrl: string, path: string) {
  const target = new URL(path, previewUrl);
  const preview = new URL(previewUrl);
  if (!target.search && preview.search) target.search = preview.search;
  return target.toString();
}

async function discoverConcretePath(
  context: BrowserContext,
  previewUrl: string,
  path: string,
): Promise<{ path: string; failure: string | null }> {
  if (!hasDynamicSegment(path)) return { path, failure: null };
  const page = await context.newPage();
  try {
    const pattern = pathTemplatePattern(path);
    for (const discoveryPath of dynamicDiscoveryPaths(path)) {
      await page.goto(routeUrl(previewUrl, discoveryPath), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
      const links = await page
        .locator("a[href]")
        .evaluateAll((anchors) =>
          anchors.map((anchor) => (anchor as unknown as { href: string }).href),
        );
      for (const href of links) {
        try {
          const candidate = new URL(href);
          if (candidate.origin === new URL(previewUrl).origin && pattern.test(candidate.pathname)) {
            return { path: candidate.pathname + candidate.search, failure: null };
          }
        } catch {
          // Ignore malformed author-provided hrefs here; the route check reports them.
        }
      }
    }
    return {
      path: concreteFallback(path),
      failure: `No published website link matched the dynamic route ${path}`,
    };
  } finally {
    await page.close();
  }
}

async function pageHealth(page: Page, previewUrl: string) {
  const evidence: string[] = [];
  const failures: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const previewOrigin = new URL(previewUrl).origin;
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const sourceUrl = message.location().url;
    if (sourceUrl) {
      try {
        if (new URL(sourceUrl).origin !== previewOrigin) return;
      } catch {
        // Browser-generated URLs such as webpack:// do not have a standard origin.
      }
    }
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const resourceType = request.resourceType();
    if (
      new URL(request.url()).origin === previewOrigin &&
      ["document", "fetch", "xhr"].includes(resourceType)
    ) {
      failedRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  return {
    evidence,
    failures,
    finish: async () => {
      const title = (await page.title()).trim();
      if (title) evidence.push(`Page title: ${title}`);
      else failures.push("The page has no browser title");
      const bodyText = (await page.locator("body").innerText()).trim();
      if (bodyText.length > 20) evidence.push("Visible page content rendered");
      else failures.push("The page rendered no useful visible content");
      const headings = await page.locator("h1:visible").count();
      if (headings > 0) evidence.push(`${headings} primary heading${headings === 1 ? "" : "s"}`);
      else failures.push("The page has no visible primary heading");
      const brokenImages = await page
        .locator("img:visible")
        .evaluateAll((images) =>
          images
            .filter(
              (image) =>
                !(image as unknown as { complete: boolean }).complete ||
                (image as unknown as { naturalWidth: number }).naturalWidth === 0,
            )
            .map((image) => (image as unknown as { src: string }).src),
        );
      if (brokenImages.length === 0) evidence.push("Visible images loaded");
      else failures.push(`Broken images: ${brokenImages.slice(0, 3).join(", ")}`);
      const unlabeledRequiredFields = await page
        .locator("input[required]:visible, select[required]:visible, textarea[required]:visible")
        .evaluateAll(
          (fields) =>
            fields.filter((field) => {
              const input = field as unknown as {
                type: string;
                labels?: unknown[];
                getAttribute(name: string): string | null;
                closest(selector: string): unknown;
              };
              if (input.type === "hidden") return false;
              if (input.getAttribute("aria-label") || input.getAttribute("aria-labelledby"))
                return false;
              if (input.labels?.length) return false;
              return !input.closest("label");
            }).length,
        );
      if (unlabeledRequiredFields > 0) {
        failures.push(`${unlabeledRequiredFields} required form field(s) have no accessible label`);
      } else {
        evidence.push("Required form fields have accessible labels");
      }
      const pageAlert = page.locator('[role="alert"]:visible').first();
      if ((await pageAlert.count()) > 0) {
        failures.push(`Page displays an error: ${(await pageAlert.innerText()).trim()}`);
      }
      if (consoleErrors.length > 0) {
        failures.push(`Browser errors: ${consoleErrors.slice(0, 3).join(" · ")}`);
      }
      if (pageErrors.length > 0)
        failures.push(`Page errors: ${pageErrors.slice(0, 3).join(" · ")}`);
      if (failedRequests.length > 0) {
        failures.push(`Failed site requests: ${failedRequests.slice(0, 3).join(" · ")}`);
      }
    },
  };
}

async function verifyInternalLinks(page: Page) {
  const failures: string[] = [];
  const evidence: string[] = [];
  const currentOrigin = new URL(page.url()).origin;
  const links = [
    ...new Set(
      await page
        .locator("a[href]")
        .evaluateAll((anchors) =>
          anchors.map((anchor) => (anchor as unknown as { href: string }).href),
        ),
    ),
  ].filter((href) => {
    try {
      const url = new URL(href);
      return url.origin === currentOrigin && !url.hash;
    } catch {
      return false;
    }
  });
  for (const href of links.slice(0, 30)) {
    const response = await page.request.get(href, { timeout: 15_000 }).catch(() => null);
    if (!response || response.status() >= 400) {
      failures.push(`Broken internal link: ${href}`);
    }
  }
  evidence.push(`${links.length} internal link${links.length === 1 ? "" : "s"} checked`);
  return { evidence, failures };
}

async function fillForm(form: ReturnType<Page["locator"]>) {
  const fields = form.locator("input:visible, select:visible, textarea:visible");
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    if (await field.isDisabled()) continue;
    const tag = await field.evaluate((element) => element.tagName.toLowerCase());
    const type = ((await field.getAttribute("type")) ?? "text").toLowerCase();
    if (["hidden", "submit", "button", "file", "reset"].includes(type)) continue;
    if (type === "checkbox" || type === "radio") {
      if (!(await field.isChecked())) await field.check();
    } else if (tag === "select") {
      const option = await field.locator("option:not([disabled])").nth(1).getAttribute("value");
      if (option) await field.selectOption(option);
    } else {
      const value =
        type === "email"
          ? `factory.qa+${Date.now()}@example.com`
          : type === "tel"
            ? "+15555550123"
            : "Factory QA test";
      await field.fill(value);
    }
  }
}

async function exerciseWorkflow(page: Page, check: QaPlanCheck) {
  const evidence: string[] = [];
  const failures: string[] = [];
  const selector = `[data-factory-workflow="${check.journeyId}"]`;
  if (check.execution === "absent") {
    const exposed = await page.locator(selector).count();
    if (exposed > 0) {
      failures.push("A staff or dashboard-only workflow is exposed on the public website");
    } else {
      evidence.push("Dashboard-only workflow is not exposed publicly");
    }
    return { evidence, failures };
  }
  const root = page.locator(`${selector}:visible`).first();
  if ((await root.count()) === 0) {
    return {
      evidence,
      failures: [
        `The ${check.title} interaction is missing its stable QA marker (${check.journeyId})`,
      ],
    };
  }
  evidence.push(`Located the ${check.title} interaction`);
  if (check.execution === "content") {
    evidence.push("The expected public content is visible");
    return { evidence, failures };
  }
  const tagName = await root.evaluate((element) => element.tagName.toLowerCase());
  const form = tagName === "form" ? root : root.locator("form:visible").first();
  if ((await form.count()) > 0) {
    const ready = await form.getAttribute("data-factory-ready");
    if (ready !== null && ready !== "true") {
      for (let attempt = 0; attempt < 32; attempt += 1) {
        if ((await form.getAttribute("data-factory-ready")) === "true") break;
        await page.waitForTimeout(250);
      }
    } else if (ready === null) {
      // Legacy generated sites predate the explicit hydration contract. Give their client island
      // enough time to attach its submit handler before exercising the static server markup.
      await page.waitForTimeout(1_000);
    }
    await fillForm(form);
    evidence.push("Filled the workflow with valid test data");
    const submit = form
      .locator('button[type="submit"]:visible, input[type="submit"]:visible')
      .first();
    if ((await submit.count()) === 0) {
      failures.push("The workflow form has no visible submit action");
      return { evidence, failures };
    }
    const responsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() !== "GET" &&
          ["fetch", "xhr", "document"].includes(response.request().resourceType()),
        { timeout: 12_000 },
      )
      .catch(() => null);
    await submit.click();
    const success = page
      .locator(
        `[data-factory-state="success"]:visible, ${selector}[data-factory-state="success"]:visible`,
      )
      .first();
    const [response, successVisible] = await Promise.all([
      responsePromise,
      success.waitFor({ state: "visible", timeout: 12_000 }).then(
        () => true,
        () => false,
      ),
    ]);
    if (response && response.status() >= 400) {
      failures.push(`The workflow request failed with status ${response.status()}`);
    } else if (!response && !successVisible) {
      const visibleError = form.locator('[role="alert"]:visible').last();
      const errorText = (await visibleError.count()) ? (await visibleError.innerText()).trim() : "";
      failures.push(
        errorText
          ? `The workflow showed an error: ${errorText}`
          : "The workflow produced neither a successful request nor a visible success state",
      );
    } else {
      if (response) evidence.push(`Workflow request completed with status ${response.status()}`);
      if (successVisible) evidence.push("Visible success state appeared");
    }
    return { evidence, failures };
  }

  const control = ["a", "button", "input"].includes(tagName)
    ? root
    : root.locator('a[href]:visible, button:visible, input[type="button"]:visible').first();
  if ((await control.count()) === 0) {
    failures.push("The workflow has no visible interactive control");
    return { evidence, failures };
  }
  const before = page.url();
  await control.click();
  await page.waitForTimeout(1_000);
  const dialogVisible = await page.locator('[role="dialog"]:visible').count();
  if (page.url() === before && dialogVisible === 0) {
    failures.push("The workflow control did not navigate or open an interactive state");
  } else {
    evidence.push(dialogVisible > 0 ? "Workflow dialog opened" : "Workflow navigation started");
  }
  return { evidence, failures };
}

export class PlaywrightWebsiteQaService implements WebsiteQaService {
  async run(
    plan: QaPlan,
    previewUrl: string,
    onCheck: (input: { index: number; total: number; title: string }) => Promise<void>,
  ): Promise<BrowserQaCheckResult[]> {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (bundledError) {
      try {
        browser = await chromium.launch({ channel: "chrome", headless: true });
      } catch {
        throw new Error(
          `Website testing browser is unavailable: ${bundledError instanceof Error ? bundledError.message : String(bundledError)}`,
        );
      }
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const results: BrowserQaCheckResult[] = [];
    try {
      for (let index = 0; index < plan.checks.length; index += 1) {
        const check = plan.checks[index]!;
        await onCheck({ index, total: plan.checks.length, title: check.title });
        const started = Date.now();
        const resolvedPath = await discoverConcretePath(context, previewUrl, check.path);
        const path = resolvedPath.path;
        const page = await context.newPage();
        const health = await pageHealth(page, previewUrl);
        try {
          if (resolvedPath.failure) health.failures.push(resolvedPath.failure);
          const response = await page.goto(routeUrl(previewUrl, path), {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          if (!response || response.status() >= 400) {
            health.failures.push(
              `Page request failed with status ${response?.status() ?? "unknown"}`,
            );
          } else {
            health.evidence.push(`Page request completed with status ${response.status()}`);
          }
          await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
          await page.mouse.wheel(0, 100_000);
          await page.waitForTimeout(300);
          await page.mouse.wheel(0, -100_000);
          await health.finish();
          if (resolvedPath.failure) {
            // The explicit discovery failure is more useful than secondary errors from a made-up
            // slug. Page health and screenshot evidence are still retained above.
          } else if (check.kind === "route") {
            const links = await verifyInternalLinks(page);
            health.evidence.push(...links.evidence);
            health.failures.push(...links.failures);
          } else {
            const workflow = await exerciseWorkflow(page, check);
            health.evidence.push(...workflow.evidence);
            health.failures.push(...workflow.failures);
          }
          const screenshot = await page.screenshot({
            animations: "disabled",
            caret: "hide",
            fullPage: true,
            type: "png",
          });
          results.push({
            id: check.id,
            title: check.title,
            path,
            passed: health.failures.length === 0,
            durationMs: Date.now() - started,
            evidence: health.evidence,
            failures: health.failures,
            screenshot: new Uint8Array(screenshot),
          });
        } catch (error) {
          const screenshot = await page
            .screenshot({ animations: "disabled", caret: "hide", fullPage: true, type: "png" })
            .catch(() => Buffer.alloc(0));
          results.push({
            id: check.id,
            title: check.title,
            path,
            passed: false,
            durationMs: Date.now() - started,
            evidence: health.evidence,
            failures: [...health.failures, error instanceof Error ? error.message : String(error)],
            screenshot: new Uint8Array(screenshot),
          });
        } finally {
          await page.close();
        }
      }
      return results;
    } finally {
      await context.close();
      await browser.close();
    }
  }
}
