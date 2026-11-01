import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vitest";

it("configures one application release with a versioned changelog", () => {
  const config = JSON.parse(readFileSync("release-please-config.json", "utf8"));
  const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"));
  expect(Object.keys(config.packages)).toEqual(["."]);
  expect(config.packages["."]).toMatchObject({
    "release-type": "simple",
    "initial-version": "0.1.0",
    "include-component-in-tag": false,
    "include-v-in-tag": true,
  });
  const version = readFileSync("version.txt", "utf8").trim();
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  if (manifest["."]) expect(manifest["."]).toBe(version);
});

it("runs the same checks for push and pull requests", () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  expect(workflow.on).toHaveProperty("push");
  expect(workflow.on).toHaveProperty("pull_request");
  expect(
    workflow.jobs.check.steps.some((step: { run?: string }) => step.run === "mise run check"),
  ).toBe(true);
});

it("uses an app-scoped token to maintain releases only on main", () => {
  const workflow = parse(readFileSync(".github/workflows/release-please.yml", "utf8"));
  expect(workflow.on.push.branches).toEqual(["main"]);
  expect(workflow.jobs.release.if).toBe("github.ref == 'refs/heads/main'");
  const [app, release] = workflow.jobs.release.steps;
  expect(app.with).toMatchObject({
    "app-id": "${{ vars.RELEASE_PLEASE_APP_ID }}",
    "private-key": "${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}",
    "permission-contents": "write",
    "permission-issues": "write",
    "permission-pull-requests": "write",
  });
  expect(release.with).toMatchObject({
    token: "${{ steps.app-token.outputs.token }}",
    "target-branch": "main",
  });
});
