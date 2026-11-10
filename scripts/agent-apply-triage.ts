import { readFileSync } from "node:fs";
import { githubRequest, requiredEnv } from "./agent-github.ts";
import { parseTriageOutput, TRIAGE_LABELS } from "./agent-lib.ts";

type Issue = {
  labels: Array<string | { name: string }>;
};

const env = process.env;
const token = requiredEnv(env, "GH_TOKEN");
const repository = requiredEnv(env, "GITHUB_REPOSITORY");
const number = Number(requiredEnv(env, "ISSUE_NUMBER"));
const outputPath = requiredEnv(env, "AGENT_OUTPUT_FILE");
const runUrl = `${requiredEnv(env, "GITHUB_SERVER_URL")}/${repository}/actions/runs/${requiredEnv(env, "GITHUB_RUN_ID")}`;

if (!Number.isInteger(number) || number < 1)
  throw new Error("ISSUE_NUMBER must be a positive integer");

const issuePath = `/repos/${repository}/issues/${number}`;
const [{ label, comment }, issue] = await Promise.all([
  Promise.resolve(parseTriageOutput(readFileSync(outputPath, "utf8"))),
  githubRequest<Issue>({ token, path: issuePath }),
]);
const preservedLabels = issue.labels
  .map((current) => (typeof current === "string" ? current : current.name))
  .filter((current) => !TRIAGE_LABELS.includes(current as (typeof TRIAGE_LABELS)[number]));

await githubRequest({
  token,
  method: "PATCH",
  path: issuePath,
  body: { labels: [...new Set([...preservedLabels, label])] },
});
await githubRequest({
  token,
  method: "POST",
  path: `${issuePath}/comments`,
  body: { body: `## OpenCode triage: ${label}\n\n${comment}\n\n[Action run](${runUrl})` },
});
