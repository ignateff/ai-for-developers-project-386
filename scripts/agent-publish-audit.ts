import { readFileSync } from "node:fs";
import { githubList, githubRequest, requiredEnv } from "./agent-github.ts";
import { auditMarker, findAuditDuplicate, parseAuditReport } from "./agent-lib.ts";

type Issue = {
  number: number;
  body?: string | null;
  pull_request?: unknown;
};

const env = process.env;
const token = requiredEnv(env, "GH_TOKEN");
const repository = requiredEnv(env, "GITHUB_REPOSITORY");
const runUrl = `${requiredEnv(env, "GITHUB_SERVER_URL")}/${repository}/actions/runs/${requiredEnv(env, "GITHUB_RUN_ID")}`;
const findings = parseAuditReport(readFileSync(requiredEnv(env, "AGENT_OUTPUT_FILE"), "utf8"));
const issues = await githubList<Issue>(token, `/repos/${repository}/issues?state=all`);

for (const finding of findings) {
  const marker = auditMarker(finding.key);
  const duplicate = findAuditDuplicate(issues, finding.key);
  if (duplicate) {
    console.log(`Skipping ${finding.key}: already tracked by #${duplicate.number}`);
    continue;
  }

  const title = `[Agent audit${finding.learning ? " learning" : ""}] ${finding.title}`;
  const issue = await githubRequest<Issue>({
    token,
    method: "POST",
    path: `/repos/${repository}/issues`,
    body: {
      title,
      body: `${marker}\n${finding.body}\n\n---\nSource: [OpenCode audit](${runUrl}).${finding.learning ? "\n\nExplicitly marked as a learning task from a clean audit; it is not presented as a discovered defect." : ""}`,
    },
  });
  console.log(`Created issue #${issue.number} for ${finding.key}`);
  issues.push(issue);
}
