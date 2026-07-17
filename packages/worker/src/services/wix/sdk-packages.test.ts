import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "../../workspace";
import { WixCliService } from ".";

function workspaceWithManifest(manifest: object) {
  const commands: Array<{ command: string; args: string[] }> = [];
  const workspace = {
    readFile: async (path: string) => {
      assert.equal(path, "package.json");
      return JSON.stringify(manifest);
    },
    exec: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  } as unknown as Workspace;
  return { workspace, commands };
}

test("dynamic Wix SDK installation rejects packages outside the scoped allowlist", async () => {
  const service = new WixCliService();
  const { workspace } = workspaceWithManifest({});

  await assert.rejects(
    service.ensureSdkPackages(["left-pad"], workspace),
    /unsupported packages: left-pad/,
  );
});

test("dynamic Wix SDK installation installs only missing verified packages", async () => {
  const service = new WixCliService();
  const { workspace, commands } = workspaceWithManifest({
    dependencies: { "@wix/site-crm": "1.0.0" },
  });

  await service.ensureSdkPackages(["@wix/site-crm", "@wix/stores"], workspace);

  assert.deepEqual(commands, [{ command: "npm", args: ["install", "@wix/stores"] }]);
});
