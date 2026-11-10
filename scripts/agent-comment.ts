import { readFileSync } from "node:fs";
import { githubRequest, requiredEnv } from "./agent-github.ts";
import { commentWithRunContext } from "./agent-lib.ts";

const env = process.env;
const token = requiredEnv(env, "GH_TOKEN");
const repository = requiredEnv(env, "GITHUB_REPOSITORY");
const number = Number(requiredEnv(env, "ISSUE_NUMBER"));
const outputPath = requiredEnv(env, "AGENT_OUTPUT_FILE");
const runUrl = `${requiredEnv(env, "GITHUB_SERVER_URL")}/${repository}/actions/runs/${requiredEnv(env, "GITHUB_RUN_ID")}`;

if (!Number.isInteger(number) || number < 1)
  throw new Error("ISSUE_NUMBER must be a positive integer");

const output = readFileSync(outputPath, "utf8");
await githubRequest({
  token,
  method: "POST",
  path: `/repos/${repository}/issues/${number}/comments`,
  body: { body: commentWithRunContext(output, runUrl) },
});
