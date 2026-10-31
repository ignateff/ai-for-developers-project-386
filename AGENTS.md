# Project

- Install: `mise install && mise run install`.
- After adding or changing dependencies, run `mise run install` again: it fails loudly when `package.json` and `pnpm-lock.yaml` drift apart (an interrupted `pnpm add` can leave them out of sync).
- Add dependencies with `mise run add <packages...>` (targets `@calendar/web`; override with `--filter @calendar/api`).
- Install Git hooks separately when needed: `mise run install-hooks` (hooks are shared by worktrees).
- Development: `mise run dev` starts both servers as pitchfork daemons; inspect with `mise daemons ls`; stop with `mise daemons stop`.
- Checks: `mise run check`; individual commands: `mise run lint`, `mise run test`, `mise run build`.
- `apps/api` is the Fastify server; `apps/web` is the Vite client; `contract` is the TypeSpec source.
- Define API operations in TypeSpec first; add contract tests for each response scenario.
- Regenerate OpenAPI and SDK with `mise run generate`; never edit `generated/` by hand.
- Keep mise tasks in sync with root `package.json` scripts: every actionable script must be runnable as `mise run <task>`. If an action has no mise task, add one rather than running the underlying command manually (`mise exec -- pnpm <script>` is a signal a task is missing).

## Design references

- For UI implementation and browser visual verification against the design, follow **`docs/design/README.md`**.
- **Primary design source:** `docs/design/calendar-booking.pen`. For the HTML fallback when Pencil cannot read the design, follow `docs/design/README.md`. The README also maps frames and exports to screens/issues.
- **Screenshots in `docs/design/screenshots/` are outdated** — they exist only for historical context and should NOT be used for implementation reference.
- Functional requirements live in linked GitHub Issues. If the design file disagrees with an approved issue, raise the discrepancy — do not silently change the agreed requirement.

## Worktrees

- For an isolated checkout, use the `using-git-worktrees` skill when available. Run the install commands above in every worktree, including an integration worktree, before its checks or push; installing shared Git hooks is not required for each worktree.
- Before an agent or its worktree is removed, verify its changes are committed on a reachable branch or saved in a verified patch outside temporary storage. Confirm the result is recoverable before cleanup.
- The default API and web ports are 3000 and 5173; the Vite proxy targets API port 3000. Check for existing services before starting another copy. No parallel-port configuration is currently documented, so do not assume changing one port isolates the full application.
- The scaffold does not require environment variables. If a later task needs ignored configuration, set it up explicitly without copying secrets automatically.

## Commit messages

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope)!: description`. Scope and `!` are optional; include the colon and space, then a concise English description. Example: `feat(api): add booking endpoint`.
- Use `feat` for a new feature and `fix` for a bug fix. Other types include `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, and `style`.
- Add an optional body after a blank line to explain context. Add optional footers after a blank line, using `Token: value` or `Token #value`, for example `Refs: #123`.
- Write the entire commit message in English: header, body, and footers.
- Mark a breaking change with `!` before the colon or an uppercase `BREAKING CHANGE: description` footer. When using `!` without the footer, describe the breaking change in the header.
- After pushing to `main`, verify the latest CI run with `gh run list` — a green run is part of finishing the task (the workflow cancels superseded runs, so judge the final pushed state).

## Agent skills

- Preserve Matt Pocock's skills as supplied; propose project documentation, agent instructions, or tooling instead of modifications to those skills.
- When delegating implementation, require completed code, tests, passing checks, and a commit, or a specific blocker; an intermediate failing test alone is not completion.
- For background agents, use an available completion notification or blocking wait; if neither allows continued execution, report the pending work instead of polling.

### Issue tracker

Issues and specs are tracked in GitHub Issues. Acceptance criteria for a task are recorded in its issue before planning; the interview and plan build from the issue, not from a paraphrase. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses five canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. See `docs/agents/domain.md`.

### Testing

Contract, browser, visual and parallel-worktree testing: see `docs/agents/testing.md`.
