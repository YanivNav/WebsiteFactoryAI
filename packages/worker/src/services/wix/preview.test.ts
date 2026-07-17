import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "../../workspace";
import { deployWixPreview, extractWixPreviewUrl } from ".";

test("preview URL extraction ignores Wix help and dashboard links", () => {
  const output = [
    "Learn more: https://dev.wix.com/docs/cli",
    "Dashboard: https://manage.wix.com/dashboard/site-id/home",
    "Site preview URL: \u001b[32mhttps://abc123.wix-host.com/course?preview=true\u001b[0m",
  ].join("\n");

  assert.equal(extractWixPreviewUrl(output), "https://abc123.wix-host.com/course?preview=true");
});

test("preview URL extraction refuses unrelated successful command URLs", () => {
  assert.equal(extractWixPreviewUrl("Authentication: https://www.wix.com/login"), null);
});

test("preview deployment retries transport failures and proves the URL is reachable", async () => {
  const commands: string[] = [];
  let deploymentAttempt = 0;
  let readinessAttempt = 0;
  const workspace = {
    exec: async (command: string, args: string[]) => {
      commands.push(`${command} ${args.join(" ")}`);
      deploymentAttempt += 1;
      return deploymentAttempt === 1
        ? { stdout: "", stderr: "UND_ERR_SOCKET: other side closed", exitCode: 1 }
        : {
            stdout: "Site preview URL: https://proof.wix-host.com/",
            stderr: "",
            exitCode: 0,
          };
    },
  } as unknown as Workspace;
  const waits: number[] = [];
  const progress: string[] = [];

  const preview = await deployWixPreview(
    workspace,
    async (message) => {
      progress.push(message);
    },
    {
      deploymentAttempts: 2,
      readinessAttempts: 2,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      fetcher: async () => {
        readinessAttempt += 1;
        return new Response("ok", { status: readinessAttempt === 1 ? 503 : 200 });
      },
    },
  );

  assert.deepEqual(preview, { url: "https://proof.wix-host.com/" });
  assert.deepEqual(commands, ["wix preview", "wix preview"]);
  assert.deepEqual(waits, [2_000, 2_000]);
  assert.ok(progress.some((message) => message.startsWith("Retrying Wix preview")));
  assert.ok(progress.some((message) => message.startsWith("Waiting for Wix")));
});
