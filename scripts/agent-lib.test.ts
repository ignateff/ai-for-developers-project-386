import { describe, expect, it } from "vitest";
import {
  auditMarker,
  commentWithRunContext,
  evaluateRunLimit,
  extractMentionCommand,
  findAuditDuplicate,
  isTrustedAssociation,
  parseAuditReport,
  parseTriageOutput,
  RUN_MARKER,
} from "./agent-lib.ts";

const sha = "0123456789abcdef0123456789abcdef01234567";

describe("interactive command authorization", () => {
  it.each(["OWNER", "MEMBER", "COLLABORATOR"])("trusts %s", (association) => {
    expect(isTrustedAssociation(association)).toBe(true);
  });

  it.each(["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE", "", undefined])(
    "rejects untrusted association %s",
    (association) => {
      expect(isTrustedAssociation(association)).toBe(false);
    },
  );

  it("extracts a command only after an @opencode mention", () => {
    expect(extractMentionCommand("Please help\n@opencode to-spec add cancellation")).toBe(
      "to-spec add cancellation",
    );
    expect(extractMentionCommand("@opencode\nreview this")).toBe("review this");
    expect(extractMentionCommand("email@opencode.example")).toBe("");
    expect(extractMentionCommand("@opencode")).toBe("");
    expect(extractMentionCommand(undefined)).toBe("");
  });
});

describe("per-PR model run limit", () => {
  const user = { login: "calendar-release-ignateff-bot[bot]" };
  const botLogin = user.login;

  it("claims runs up to the limit and counts failed runs too", () => {
    expect(evaluateRunLimit([], sha, 3, botLogin)).toEqual({ allowed: true, used: 0, nextRun: 1 });
    const comments = [
      { body: `${RUN_MARKER}\nstarted`, user },
      { body: `${RUN_MARKER}\nfailed`, user },
    ];
    expect(evaluateRunLimit(comments, sha, 3, botLogin)).toEqual({
      allowed: true,
      used: 2,
      nextRun: 3,
    });
  });

  it("ignores forged markers from other authors", () => {
    const comments = [{ body: RUN_MARKER, user: { login: "untrusted-user" } }];
    expect(evaluateRunLimit(comments, sha, 1, botLogin)).toEqual({
      allowed: true,
      used: 0,
      nextRun: 1,
    });
  });

  it("refuses before another model run and detects an existing refusal for the SHA", () => {
    const comments = Array.from({ length: 3 }, () => ({ body: RUN_MARKER, user }));
    expect(evaluateRunLimit(comments, sha, 3, botLogin)).toEqual({
      allowed: false,
      used: 3,
      alreadyReported: false,
    });
    comments.push({ body: `<!-- opencode-agent:limit-exhausted:${sha} -->`, user });
    expect(evaluateRunLimit(comments, sha, 3, botLogin)).toEqual({
      allowed: false,
      used: 3,
      alreadyReported: true,
    });
  });

  it("fails closed on invalid limits and abbreviated SHAs", () => {
    expect(() => evaluateRunLimit([], sha, 0, botLogin)).toThrow("positive integer");
    expect(() => evaluateRunLimit([], "abc123", 3, botLogin)).toThrow("full 40-character");
    expect(() => evaluateRunLimit([], sha, 3, "")).toThrow("AGENT_BOT_LOGIN");
  });
});

describe("structured agent outputs", () => {
  it("accepts only canonical triage labels and a useful comment", () => {
    expect(parseTriageOutput("TRIAGE_LABEL: ready-for-agent\nThe scope is complete.")).toEqual({
      label: "ready-for-agent",
      comment: "The scope is complete.",
    });
    expect(() => parseTriageOutput("TRIAGE_LABEL: arbitrary\nText")).toThrow("Expected");
    expect(() => parseTriageOutput("ready-for-agent\nText")).toThrow("Expected");
  });

  it("parses and validates audit findings", () => {
    const output = `Report text\n<!-- opencode-audit\n${JSON.stringify({
      findings: [
        {
          key: "stale-docs",
          title: "Stale docs",
          body: "The setup section is stale.",
          learning: false,
        },
      ],
    })}\n-->`;
    expect(parseAuditReport(output)).toEqual([
      {
        key: "stale-docs",
        title: "Stale docs",
        body: "The setup section is stale.",
        learning: false,
      },
    ]);
    expect(auditMarker("stale-docs")).toBe("<!-- opencode-audit:key=stale-docs -->");
  });

  it("accepts an explicitly empty clean audit", () => {
    expect(parseAuditReport('Clean\n<!-- opencode-audit\n{"findings":[]}\n-->')).toEqual([]);
  });

  it("deduplicates against issues, including closed ones, but not PR bodies", () => {
    const marker = auditMarker("stale-docs");
    expect(
      findAuditDuplicate(
        [
          { number: 1, body: marker, pull_request: {} },
          { number: 2, body: marker },
        ],
        "stale-docs",
      )?.number,
    ).toBe(2);
  });

  it("rejects missing, malformed, duplicate, or invented-shape findings", () => {
    expect(() => parseAuditReport("No structured result")).toThrow("missing");
    expect(() => parseAuditReport("<!-- opencode-audit\nnot-json\n-->")).toThrow("valid JSON");
    expect(() =>
      parseAuditReport(
        '<!-- opencode-audit\n{"findings":[{"key":"same","title":"One","body":"Long enough body","learning":false},{"key":"same","title":"Two","body":"Another long body","learning":false}]}\n-->',
      ),
    ).toThrow("unique");
    expect(() =>
      parseAuditReport(
        '<!-- opencode-audit\n{"findings":[{"key":"x","title":"Bad","body":"short","learning":"yes"}]}\n-->',
      ),
    ).toThrow("Invalid");
  });
});

describe("comment publication", () => {
  it("links the run and truncates oversized output", () => {
    expect(commentWithRunContext("Result", "https://example.test/run")).toContain("Result");
    const comment = commentWithRunContext("x".repeat(70_000), "https://example.test/run");
    expect(comment).toHaveLength(60_000);
    expect(comment).toContain("Response truncated");
  });
});
