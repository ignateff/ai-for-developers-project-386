# Project

- Install: `mise install && mise run install`.
- Development: `mise daemons start`; inspect with `mise daemons ls`; stop with `mise daemons stop`.
- Checks: `mise run check`; individual commands: `mise run lint`, `mise run test`, `mise run build`.
- `apps/api` is the Fastify server; `apps/web` is the Vite client; `contract` is the TypeSpec source.
- Define API operations in TypeSpec first; add contract tests for each response scenario.
- Regenerate OpenAPI and SDK with `mise run generate`; never edit `generated/` by hand.
- Keep mise tasks in sync with root `package.json` scripts: every actionable script must be runnable as `mise run <task>`. If an action has no mise task, add one rather than running the underlying command manually (`mise exec -- pnpm <script>` is a signal a task is missing).

## Commit messages

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope)!: description`. Scope and `!` are optional; include the colon and space, then a concise English description. Example: `feat(api): add booking endpoint`.
- Use `feat` for a new feature and `fix` for a bug fix. Other types include `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, and `style`.
- Add an optional body after a blank line to explain context. Add optional footers after a blank line, using `Token: value` or `Token #value`, for example `Refs: #123`.
- Write the entire commit message in English: header, body, and footers.
- Mark a breaking change with `!` before the colon or an uppercase `BREAKING CHANGE: description` footer. When using `!` without the footer, describe the breaking change in the header.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses five canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. See `docs/agents/domain.md`.
