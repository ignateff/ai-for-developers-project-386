import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/agent-prepare.ts");
const sha = "0123456789abcdef0123456789abcdef01234567";
let directory: string;

function prepare(
  overrides: Record<string, unknown> = {},
  body = "@opencode to-spec add cancellation",
  eventName = "issue_comment",
) {
  const eventPath = join(directory, "event.json");
  const outputPath = join(directory, "output");
  writeFileSync(
    eventPath,
    JSON.stringify({
      action: "created",
      comment: { body, author_association: "OWNER" },
      sender: { type: "User" },
      issue: { number: 83 },
      ...overrides,
    }),
  );
  writeFileSync(outputPath, "");
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_SERVER_URL: "https://github.example",
      GITHUB_RUN_ID: "123",
      GITHUB_SHA: sha,
      GITHUB_OUTPUT: outputPath,
      RUNNER_TEMP: directory,
    },
  });
  return { result, outputPath };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "agent-prepare-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("agent-prepare", () => {
  it("prepares an issue command without calling the GitHub API", () => {
    const { result, outputPath } = prepare();
    expect(result.status).toBe(0);
    expect(readFileSync(outputPath, "utf8")).toContain("is_pr=false");
    const prompt = readFileSync(join(directory, "opencode-prompt.md"), "utf8");
    expect(prompt).toContain("issue #83");
    expect(prompt).toContain("Load the to-spec skill");
    expect(prompt).toContain(sha);
  });

  it("rejects an untrusted author before preparing a model prompt", () => {
    const { result } = prepare({
      comment: { body: "@opencode review", author_association: "NONE" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Only OWNER, MEMBER, or COLLABORATOR");
  });

  it("rejects bot commands and missing commands", () => {
    expect(prepare({ sender: { type: "Bot" } }).result.status).toBe(1);
    const empty = prepare({}, "A comment without a command");
    expect(empty.result.status).toBe(1);
    expect(empty.result.stderr).toContain("must contain @opencode");
  });

  it("exposes fork status before credentials or model can be used", () => {
    const { result, outputPath } = prepare(
      {
        pull_request: {
          number: 84,
          head: { sha, ref: "foreign", repo: { fork: true } },
          base: { ref: "main" },
        },
      },
      "@opencode review",
      "pull_request_review_comment",
    );
    expect(result.status).toBe(0);
    expect(readFileSync(outputPath, "utf8")).toContain("head_repo_fork=true");
  });
});
