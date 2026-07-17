import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubService } from "../services/github";
import type { WixService } from "../services/wix";
import type { ProjectStore } from "../store";
import type { Workspace } from "../workspace";
import { createGeneratePreview } from "./generatePreview.js";
import type { StageContext } from "./types.js";

test("preview stage deploys the exact synchronized and verified source revision", async () => {
  const calls: string[] = [];
  const artifacts: Array<{
    type: string;
    data: unknown;
    provenance: { promptHash: string; inputsHash: string };
  }> = [];
  const workspace = {} as Workspace;
  const githubService = {
    syncCanonical: async (receivedWorkspace: Workspace) => {
      assert.equal(receivedWorkspace, workspace);
      calls.push("sync");
      return "revision-123";
    },
  } as unknown as GitHubService;
  const wixService = {
    build: async (receivedWorkspace: Workspace) => {
      assert.equal(receivedWorkspace, workspace);
      calls.push("build");
    },
    preview: async (
      receivedWorkspace: Workspace,
      onProgress?: (message: string) => Promise<void>,
    ) => {
      assert.equal(receivedWorkspace, workspace);
      calls.push("preview");
      await onProgress?.("Checking the Wix preview");
      return { url: "https://proof.wix-host.com/" };
    },
  } as unknown as WixService;
  const ctx = {
    projectId: "project-1",
    projectTitle: "School",
    stage: "GeneratingPreview",
    brief: "School site",
    mode: "simple",
    settings: { publishTarget: "wix-managed" },
    attempts: 0,
    wix: { siteId: "site-1", appId: "app-1" },
    store: {} as ProjectStore,
    progress: async () => undefined,
    log: async () => undefined,
    emitArtifact: async (
      type: string,
      data: unknown,
      provenance: { promptHash: string; inputsHash: string },
    ) => {
      artifacts.push({ type, data, provenance });
      return { id: "preview-1", version: 1 };
    },
  } as StageContext;

  const result = await createGeneratePreview({ githubService, wixService, workspace }).run(ctx);

  assert.deepEqual(calls, ["sync", "build", "preview"]);
  assert.deepEqual(result, { kind: "advance" });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]?.type, "preview");
  assert.deepEqual(artifacts[0]?.data, {
    url: "https://proof.wix-host.com/",
    sourceRevision: "revision-123",
  });
  assert.ok(artifacts[0]?.provenance.inputsHash);
});
