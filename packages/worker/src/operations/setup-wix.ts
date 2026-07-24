import { type WixProject, wixDashboardUrl } from "@factory/shared";
import { GitService } from "../services/git";
import { WixService } from "../services/wix";
import { LocalWorkspace } from "../workspace";
import { reviewCompletion, type WorkHandler } from "./types";

let git: GitService;
let wix: WixService;

export const setupWix: WorkHandler<"setupWix"> = {
  operation: "setupWix",
  async run(ctx) {
    const decision = await ctx.getInput("decision");
    const previousProject = await ctx.getRevisionBase("wixProject");
    const hosting = decision.data.hosting;
    git ??= new GitService();
    wix ??= new WixService();

    // One stable name for the checkout folder AND the GitHub repository —
    // re-runs and recoveries converge on the same project.
    const folderName = previousProject?.data.folderName ?? repoName(ctx.work.projectTitle, ctx.work.projectId);
    const workspace = new LocalWorkspace(folderName);

    await ctx.progress(5, "Preparing the project repository");
    const repo = await git.ensureRepo(folderName);

    // Recovery path (PLAN.md): if the repository already has the project but
    // the local checkout is missing, restore it — never re-scaffold and try to
    // merge unrelated histories.
    if (repo.existed && !(await workspace.exists())) {
      await ctx.progress(10, "Restoring the project from its backup");
      await git.restore(workspace, repo);
    }

    const alreadyScaffolded =
      (await workspace.hasFile("wix.config.json")) || (await workspace.hasFile("package.json"));

    let siteId = previousProject?.data.wix.siteId;

    if (!alreadyScaffolded) {
      if (hosting === "wixManaged") {
        await wix.ensureLogin(ctx, workspace);
        await ctx.progress(
          15,
          "Creating your Wix managed Headless site",
        );
        const scaffolded = await wix.scaffoldManaged(ctx, workspace, ctx.work.projectTitle);
        siteId = scaffolded.siteId ?? siteId;
      } else {
        await ctx.progress(15, "Creating your self-managed site");
        await wix.scaffoldSelfManaged(ctx, workspace, ctx.work.projectTitle);
      }
    } else {
      ctx.log("info", "Workspace already created — reusing it");
    }

    await ctx.progress(80, "Backing up the project code");
    await git.commitAndPush(workspace, repo, "Wix Headless project setup");

    const project: WixProject = {
      hosting,
      folderName,
      repository: {
        owner: repo.owner,
        name: repo.name,
        url: repo.htmlUrl,
        defaultBranch: "main",
      },
      wix: {
        siteId,
        // A real, site-scoped dashboard link, derived from the metasite id the
        // scaffold provisioned — not scraped from CLI output, not fabricated.
        dashboardUrl: wixDashboardUrl(siteId),
      },
      pendingSetup:
        hosting === "selfManaged"
          ? [
              {
                title: "Create the Wix Headless project",
                instructions:
                  "Create a new headless project in your Wix account and pick the business " +
                  "features the site plan needs (Stores, Bookings, CMS…).",
                url: "https://www.wix.com/intro/headless",
              },
              {
                title: "Connect the site to Wix",
                instructions:
                  "In the new project's dashboard, add an OAuth app under Headless Settings " +
                  "and paste its client ID into the project's environment (WIX_CLIENT_ID).",
              },
            ]
          : undefined,
    };

    await ctx.progress(95, "Finalizing your Wix setup");
    const artifact = await ctx.addArtifact("wixProject", "wixProject", project, previousProject?.id);
    return reviewCompletion("setupWix", artifact.id);
  },
};

/** GitHub-safe, stable repository/folder name: slug of the title + project id suffix. */
function repoName(projectTitle: string, projectId: string): string {
  const slug =
    projectTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site";
  return `${slug}-${projectId.slice(-6)}`;
}
