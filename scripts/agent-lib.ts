export const AGENT_MENTION = "@opencode";
export const RUN_MARKER = "<!-- opencode-agent:run -->";
export const AUDIT_BLOCK_PATTERN = /<!--\s*opencode-audit\s*([\s\S]*?)\s*-->/;

export const TRIAGE_LABELS = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;

export type TriageLabel = (typeof TRIAGE_LABELS)[number];

export type IssueComment = {
  body?: string | null;
  user?: { login?: string } | null;
};

export type RunLimitDecision =
  | { allowed: true; used: number; nextRun: number }
  | { allowed: false; used: number; alreadyReported: boolean };

export type AuditFinding = {
  key: string;
  title: string;
  body: string;
  learning: boolean;
};

const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function isTrustedAssociation(association: unknown): boolean {
  return typeof association === "string" && trustedAssociations.has(association);
}

export function extractMentionCommand(body: unknown): string {
  if (typeof body !== "string") return "";
  const match = /(?:^|\s)@opencode(?:\s+|$)/.exec(body);
  return match ? body.slice(match.index + match[0].length).trim() : "";
}

export function evaluateRunLimit(
  comments: IssueComment[],
  headSha: string,
  maximum: number,
  botLogin: string,
): RunLimitDecision {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("MAX_RUNS_PER_PR must be a positive integer");
  }
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error("A full 40-character head SHA is required");
  }
  if (!botLogin) throw new Error("AGENT_BOT_LOGIN is required");

  const ownedComments = comments.filter((comment) => comment.user?.login === botLogin);
  const used = ownedComments.filter((comment) => comment.body?.includes(RUN_MARKER)).length;
  if (used < maximum) return { allowed: true, used, nextRun: used + 1 };

  const exhaustionMarker = `<!-- opencode-agent:limit-exhausted:${headSha} -->`;
  return {
    allowed: false,
    used,
    alreadyReported: ownedComments.some((comment) => comment.body?.includes(exhaustionMarker)),
  };
}

export function parseTriageOutput(output: string): { label: TriageLabel; comment: string } {
  const match = /^TRIAGE_LABEL: ([a-z-]+)\n([\s\S]+)$/.exec(output.trim());
  const label = match?.[1] as TriageLabel | undefined;
  const comment = match?.[2].trim();
  if (!label || !TRIAGE_LABELS.includes(label) || !comment) {
    throw new Error("Expected TRIAGE_LABEL: <canonical-label>, a newline, and a non-empty comment");
  }
  return { label, comment };
}

function parseFinding(value: unknown): AuditFinding {
  if (!value || typeof value !== "object") throw new Error("Each audit finding must be an object");
  const finding = value as Record<string, unknown>;
  if (
    typeof finding.key !== "string" ||
    !/^[a-z0-9][a-z0-9-]{2,63}$/.test(finding.key) ||
    typeof finding.title !== "string" ||
    finding.title.trim().length < 3 ||
    finding.title.length > 200 ||
    typeof finding.body !== "string" ||
    finding.body.trim().length < 10 ||
    finding.body.length > 55_000 ||
    typeof finding.learning !== "boolean"
  ) {
    throw new Error("Invalid audit finding key, title, body, or learning flag");
  }
  return {
    key: finding.key,
    title: finding.title.trim(),
    body: finding.body.trim(),
    learning: finding.learning,
  };
}

export function parseAuditReport(output: string): AuditFinding[] {
  const match = AUDIT_BLOCK_PATTERN.exec(output);
  if (!match) throw new Error("The audit report is missing its opencode-audit JSON block");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error("The opencode-audit block must contain valid JSON");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("The audit block must be an object");
  const findings = (parsed as Record<string, unknown>).findings;
  if (!Array.isArray(findings) || findings.length > 5) {
    throw new Error("The audit block must contain at most five findings");
  }

  const result = findings.map(parseFinding);
  if (new Set(result.map((finding) => finding.key)).size !== result.length) {
    throw new Error("Audit finding keys must be unique within a report");
  }
  return result;
}

export function auditMarker(key: string): string {
  return `<!-- opencode-audit:key=${key} -->`;
}

export type AuditIssue = {
  number: number;
  body?: string | null;
  pull_request?: unknown;
};

export function findAuditDuplicate<T extends AuditIssue>(issues: T[], key: string): T | undefined {
  const marker = auditMarker(key);
  return issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));
}

export function commentWithRunContext(output: string, runUrl: string, maximum = 60_000): string {
  const header = `## OpenCode agent\n\n[Action run](${runUrl})\n\n`;
  const cleanOutput = output.trim() || "The agent returned an empty response.";
  if (header.length + cleanOutput.length <= maximum) return header + cleanOutput;

  const suffix = "\n\n… Response truncated; see the Actions artifact for the complete output.";
  return header + cleanOutput.slice(0, maximum - header.length - suffix.length) + suffix;
}
