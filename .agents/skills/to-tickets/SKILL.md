---
name: to-tickets
description: Split a human-approved specification into linked implementation tickets; use for @opencode to-tickets before implement-spec.
---

# to-tickets

1. Read the specification and locate an explicit human approval of its current scope. If approval is absent or the scope changed afterwards, publish the mismatch and stop at this gate.
2. Create the smallest useful set of GitHub issues. Give each ticket a scoped outcome, acceptance criteria, verification requirements, and a link to the specification. Record dependencies with native issue dependencies or `Blocked by:` links. Completion: every specification requirement maps to at least one ticket and every ticket maps back to the specification.
3. Publish the ordered ticket list in the specification and source issue, including dependencies and the intended integration branch. Completion: all ticket URLs are visible from both issues.
4. Request explicit human approval of the ticket list. Completion: the response states that implementation waits for that approval; ticket creation is not treated as approval.
