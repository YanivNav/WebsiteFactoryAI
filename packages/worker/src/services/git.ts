import type { Workspace } from "../workspace";

export interface GitHubRepo {
  owner: string;
  name: string;
  /** Web page of the repository. */
  htmlUrl: string;
  /** HTTPS clone URL without credentials. */
  cloneUrl: string;
  defaultBranch: string;
  /** True when the repository already existed before this call. */
  existed: boolean;
}

/** Commits made by the factory carry its own identity. */
const FACTORY_IDENTITY = [
  "-c",
  "user.name=Website Factory",
  "-c",
  "user.email=factory@websitefactory.dev",
];

/**
 * Everything git: the private-organization GitHub backup (PLAN.md Phase 5) and
 * the git workflows against a project checkout. GitHub is reached through its
 * REST API; git commands run through the Workspace — this service never
 * touches the filesystem itself.
 *
 * Requires GITHUB_TOKEN (create private repos in GITHUB_ORG + push) and
 * GITHUB_ORG.
 */
export class GitService {
  private readonly token: string;
  private readonly org: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    const org = process.env.GITHUB_ORG;
    if (!token || !org) {
      throw new Error("GITHUB_TOKEN and GITHUB_ORG must be set to back up projects to GitHub");
    }
    this.token = token;
    this.org = org;
  }

  /** Create the private repository, or return it when it already exists. */
  async ensureRepo(name: string): Promise<GitHubRepo> {
    const existing = await this.request(`/repos/${this.org}/${name}`);
    if (existing.status === 200) return this.toRepo(await existing.json(), true);
    if (existing.status !== 404) throw await this.asError("look up repository", existing);

    const created = await this.request(`/orgs/${this.org}/repos`, {
      method: "POST",
      body: JSON.stringify({ name, private: true, has_wiki: false, auto_init: false }),
    });
    if (created.status === 201) return this.toRepo(await created.json(), false);
    // Lost a race with another attempt — fetch what exists now.
    if (created.status === 422) {
      const retry = await this.request(`/repos/${this.org}/${name}`);
      if (retry.status === 200) return this.toRepo(await retry.json(), true);
    }
    throw await this.asError("create repository", created);
  }

  /**
   * Restore a missing checkout from its repository (the recovery path — never
   * re-scaffold over an existing project history). Leaves `origin` set to the
   * credential-free URL.
   */
  async restore(workspace: Workspace, repo: GitHubRepo): Promise<void> {
    await workspace.execInParent("git", ["clone", this.authenticatedUrl(repo), workspace.name]);
    await workspace.execOrThrow("git", ["remote", "set-url", "origin", repo.cloneUrl]);
  }

  /**
   * Revert the working tree to the scaffold (the repo's initial commit) while
   * leaving HEAD and history untouched, so a rebuild starts from a clean
   * scaffold and the follow-up commit still fast-forwards (never a force-push).
   * `read-tree` rewrites the index + tracked files to the scaffold's tree;
   * `clean -fd` drops stray untracked files but keeps gitignored `node_modules`.
   */
  async resetToScaffold(workspace: Workspace): Promise<void> {
    const roots = await workspace.execOrThrow("git", ["rev-list", "--max-parents=0", "HEAD"]);
    const scaffold = roots.stdout.trim().split("\n").filter(Boolean).at(-1);
    if (!scaffold) throw new Error("Could not find the scaffold commit to reset to");
    await workspace.execOrThrow("git", ["read-tree", "--reset", "-u", scaffold]);
    await workspace.execOrThrow("git", ["clean", "-fd"]);
  }

  /** Commit anything uncommitted and push main — plain push, never force. */
  async commitAndPush(workspace: Workspace, repo: GitHubRepo, message: string): Promise<void> {
    if (!(await workspace.hasFile(".git"))) {
      await workspace.execOrThrow("git", ["init"]);
    }

    const status = await workspace.execOrThrow("git", ["status", "--porcelain"]);
    if (status.stdout.trim().length > 0) {
      await workspace.execOrThrow("git", ["add", "-A"]);
      await workspace.execOrThrow("git", [...FACTORY_IDENTITY, "commit", "-m", message]);
    }

    await workspace.execOrThrow("git", ["branch", "-M", "main"]);

    const remotes = await workspace.execOrThrow("git", ["remote"]);
    if (remotes.stdout.split("\n").includes("origin")) {
      await workspace.execOrThrow("git", ["remote", "set-url", "origin", repo.cloneUrl]);
    } else {
      await workspace.execOrThrow("git", ["remote", "add", "origin", repo.cloneUrl]);
    }

    // The token rides only on this one command — it is never written to config.
    await workspace.execOrThrow("git", [
      "push",
      this.authenticatedUrl(repo),
      "HEAD:refs/heads/main",
    ]);
  }

  /**
   * Clone URL with the token embedded, for a single push/clone command.
   * Never write this into git config or any file — pass it per-command only.
   */
  private authenticatedUrl(repo: GitHubRepo): string {
    return `https://x-access-token:${this.token}@github.com/${repo.owner}/${repo.name}.git`;
  }

  private toRepo(data: any, existed: boolean): GitHubRepo {
    return {
      owner: data.owner?.login ?? this.org,
      name: data.name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      defaultBranch: data.default_branch ?? "main",
      existed,
    };
  }

  private request(pathname: string, init?: RequestInit): Promise<Response> {
    return fetch(`https://api.github.com${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  }

  private async asError(action: string, response: Response): Promise<Error> {
    const body = await response.text().catch(() => "");
    return new Error(`GitHub: could not ${action} (${response.status}): ${body.slice(0, 300)}`);
  }
}
