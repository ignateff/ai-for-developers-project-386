## Summary

<!-- What changed and why? Link the source issue, approved specification, and tickets. -->

- Source issue:
- Specification:
- Tickets:
- Human approval — specification:
- Human approval — ticket list:

## Verification

<!-- Select checks according to the consequences of an error; do not tick an unperformed check. -->

- [ ] `mise run check` passed at the PR head SHA.
- [ ] Positive specification scenario passed; CI link:
- [ ] Negative specification scenario rejects the violation; CI link:
- [ ] RED evidence for the new behaviour and GREEN evidence after the fix are linked.
- [ ] Documentation and generated artifacts are current.
- [ ] For UI changes: main and adjacent browser artifacts are attached for the full head SHA below.
- [ ] For infrastructure/security changes: failure, authorization, and rollback paths were exercised.

**Head SHA:**

**Browser/CI artifacts:**

**Human SHA and evidence check before merge:**

## Risk

<!-- Blast radius, likely failure mode, data/credential/production impact, and remaining limitations. -->

## Rollback

<!-- Name the safest concrete recovery: revert commit/PR, disable a workflow, restore configuration, or a data-compatible recovery procedure. Include any ordering constraints. -->

## Review and merge

- [ ] Independent review findings are fixed or have a documented rejection rationale.
- [ ] One recurring review finding is preserved as a test, lint rule, or clearer instruction.
- [ ] A human reviewed the current head SHA and evidence and made the merge decision.
