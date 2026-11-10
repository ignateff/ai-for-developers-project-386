---
name: to-spec
description: Turn an agreed user need or issue into a reviewable specification; use for @opencode to-spec before tickets or implementation.
---

# to-spec

1. Read the source issue, linked decisions, AGENTS.md, and relevant domain documentation. Completion: the problem, current behaviour, constraints, and unresolved choices are grounded in repository evidence.
2. Ask the human about material choices that cannot be resolved from those sources. Completion: each answer or explicit delegation is recorded in the source issue.
3. Publish one specification issue linked from the source issue. Include Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, and Further Notes. Define the main and adjacent browser scenarios and the negative CI scenario when behaviour changes. Completion: a reviewer can derive acceptance criteria and test oracles without reading a chat transcript.
4. Link the specification back to the source issue and request explicit human approval. Completion: the response names the specification URL and states that tickets and implementation wait for approval. Existing comments or labels imply approval only when a human explicitly approves the specification scope.
