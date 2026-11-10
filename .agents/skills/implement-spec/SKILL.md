---
name: implement-spec
description: Implement a specification after humans approved both it and its ticket list; use for @opencode implement-spec with tests, evidence, and a traceable PR.
---

# implement-spec

1. Read the source issue, specification, tickets, and all current comments. Verify explicit human approval of both the current specification and the ticket list. If either is absent or stale, report the exact missing gate and stop before editing.
2. Create or update the agreed integration branch. Implement every approved ticket with conventional commits referencing its issue. Preserve existing work and follow AGENTS.md. Completion: each ticket is either complete with passing checks or has a concrete published blocker.
3. Exercise the approved positive and negative scenarios. Capture a failing result caused by violating the new behaviour and a passing result after the fix; never fabricate RED by running an unrelated failure. Completion: CI links and commands demonstrate both outcomes.
4. For user-visible work, produce browser evidence for the main and adjacent scenarios at the PR head SHA. Publish screenshots, traces, or other browser artifacts and record the full SHA. Completion: a human can compare the artifact SHA with the PR head without rerunning the change.
5. Open or update the PR using the repository template. Link the source issue, specification, tickets, human approvals, CI, browser artifacts, risks, and rollback. Completion: all checks are green and unresolved review findings are listed explicitly. A human compares the head SHA and evidence, resolves the review, and decides whether to merge; the agent does not record that decision on the human's behalf.
