# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- Sub-issue: `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>`. If unavailable, put `Part of #<parent>` in the child body.
- Comment: `gh issue comment <number> --body "..."`.
- Labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Infer the repo from `git remote -v`; `gh` does this automatically inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set to `yes` if external PRs should enter the triage queue. When enabled, use `gh pr` to read, list, comment, label and close PRs. Issue and PR numbers share a namespace.

## Skill operations

- Publish to the issue tracker: create a GitHub issue.
- Fetch the relevant ticket: read the issue as above.
- `/wayfinder`: create a map issue with `wayfinder:map`, link child issues as sub-issues, and label them `wayfinder:<type>`. If sub-issues are unavailable, use a task list and `Part of #<map>`.
- Record blockers with GitHub native issue dependencies; use `Blocked by: #<number>` if unavailable. A ticket is unblocked when every blocker is closed.
- Select the first open map child with no open blockers and no assignee. Claim it with `gh issue edit <number> --add-assignee @me`.
- Resolve by commenting the answer, closing the issue, and adding a summary and link to the map's Decisions-so-far.
