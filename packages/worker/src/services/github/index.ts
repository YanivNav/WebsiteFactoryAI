import { Octokit } from "@octokit/rest";

import type { Workspace } from "../../workspace";

export interface GitHubRepository {
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
}

export interface GitHubService {
  ensureRepository(input: {
    projectId: string;
    projectTitle: string;
    workspace: Workspace;
    restoreInterruptedAttempt?: boolean;
  }): Promise<GitHubRepository>;
  commitAndPush(workspace: Workspace, message: string): Promise<string>;
}

function repositoryName(title: string, projectId: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  const suffix = projectId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toLowerCase();
  return `${slug || "website"}-${suffix || "project"}`;
}

function credentials() {
  const token = process.env.GITHUB_TOKEN;
  const organization = process.env.GITHUB_ORG;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  if (!organization) throw new Error("GITHUB_ORG is not configured");
  return { token, organization };
}

function parseRepository(data: unknown): GitHubRepository {
  const repository = data as {
    name?: unknown;
    clone_url?: unknown;
    html_url?: unknown;
    default_branch?: unknown;
    owner?: { login?: unknown };
  };
  if (
    typeof repository.name !== "string" ||
    typeof repository.clone_url !== "string" ||
    typeof repository.html_url !== "string" ||
    typeof repository.owner?.login !== "string"
  ) {
    throw new Error("GitHub returned an incomplete repository record");
  }
  return {
    owner: repository.owner.login,
    name: repository.name,
    cloneUrl: repository.clone_url,
    htmlUrl: repository.html_url,
    defaultBranch:
      typeof repository.default_branch === "string" ? repository.default_branch : "main",
  };
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export class GitHubRestService implements GitHubService {
  async ensureRepository({
    projectId,
    projectTitle,
    workspace,
    restoreInterruptedAttempt = false,
  }: {
    projectId: string;
    projectTitle: string;
    workspace: Workspace;
    restoreInterruptedAttempt?: boolean;
  }): Promise<GitHubRepository> {
    const { token, organization } = credentials();
    const name = repositoryName(projectTitle, projectId);
    const octokit = new Octokit({
      auth: token,
      userAgent: "website-factory-worker",
      request: {
        headers: {
          "x-github-api-version": "2026-03-10",
        },
      },
    });
    let repository: GitHubRepository;
    try {
      const { data } = await octokit.repos.get({
        owner: organization,
        repo: name,
      });
      repository = parseRepository(data);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const { data } = await octokit.rest.repos.createInOrg({
        org: organization,
        name,
        description: `Generated Wix Headless site for ${projectTitle}`,
        private: true,
        auto_init: false,
      });
      repository = parseRepository(data);
    }
    const authorization = gitAuthorization(token);
    await workspace.setRemote(repository.cloneUrl);
    if (restoreInterruptedAttempt) await workspace.restoreFromRemote(authorization);
    await workspace.sync(authorization);
    await workspace.commit("chore: initialize Wix Headless project");
    await workspace.push(authorization);
    return { ...repository, defaultBranch: "main" };
  }

  async commitAndPush(workspace: Workspace, message: string): Promise<string> {
    const { token } = credentials();
    const revision = await workspace.commit(message);
    await workspace.push(gitAuthorization(token));
    return revision;
  }
}

function gitAuthorization(token: string) {
  const credentials = Buffer.from(`x-access-token:${token}`).toString("base64");
  return `Authorization: Basic ${credentials}`;
}
