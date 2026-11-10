import { githubList, githubRequest, requiredEnv } from "./agent-github.ts";
import { evaluateRunLimit, RUN_MARKER, type IssueComment } from "./agent-lib.ts";

const env = process.env;
const token = requiredEnv(env, "GH_TOKEN");
const repository = requiredEnv(env, "GITHUB_REPOSITORY");
const number = Number(requiredEnv(env, "PR_NUMBER"));
const headSha = requiredEnv(env, "HEAD_SHA");
const maximum = Number(env.MAX_RUNS_PER_PR ?? "3");
const botLogin = requiredEnv(env, "AGENT_BOT_LOGIN");
const runUrl = `${requiredEnv(env, "GITHUB_SERVER_URL")}/${repository}/actions/runs/${requiredEnv(env, "GITHUB_RUN_ID")}`;

if (!Number.isInteger(number) || number < 1)
  throw new Error("PR_NUMBER must be a positive integer");

const commentsPath = `/repos/${repository}/issues/${number}/comments`;
const comments = await githubList<IssueComment>(token, commentsPath);
const decision = evaluateRunLimit(comments, headSha, maximum, botLogin);

if (decision.allowed) {
  await githubRequest({
    token,
    method: "POST",
    path: commentsPath,
    body: {
      body: `${RUN_MARKER}\nOpenCode model run ${decision.nextRun}/${maximum} claimed for \`${headSha}\`.\n\n[Action run](${runUrl})`,
    },
  });
  console.log(`Claimed model run ${decision.nextRun}/${maximum} for PR #${number}`);
} else {
  if (!decision.alreadyReported) {
    await githubRequest({
      token,
      method: "POST",
      path: commentsPath,
      body: {
        body: `<!-- opencode-agent:limit-exhausted:${headSha} -->\n## OpenCode run refused\n\n**Reason:** per-PR model run limit exhausted (${decision.used}/${maximum}). No model was called.\n\n**Head SHA:** \`${headSha}\`\n\n[Action logs](${runUrl})`,
      },
    });
  }
  console.error(
    `Model run refused: per-PR limit exhausted (${decision.used}/${maximum}); SHA ${headSha}; ${runUrl}`,
  );
  process.exitCode = 2;
}
