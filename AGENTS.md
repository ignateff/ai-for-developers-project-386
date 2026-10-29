# Project

- Install: `mise install && mise run install`.
- Development: `mise daemons start`; inspect with `mise daemons ls`; stop with `mise daemons stop`.
- Checks: `mise run check`; individual commands: `mise run lint`, `mise run test`, `mise run build`.
- `apps/api` is the Fastify server; `apps/web` is the Vite client; `contract` is the TypeSpec source.
- Define API operations in TypeSpec first; add contract tests for each response scenario.
- Regenerate OpenAPI and SDK with `mise exec -- pnpm run generate`; never edit `generated/` by hand.
- Use Conventional Commits: `type(scope): description`, with an optional scope and a concise English description; e.g. `feat(api): add booking endpoint`.
- Choose the type for the change: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, or `style`.
- Mark breaking changes with `!` before the colon or a `BREAKING CHANGE:` footer.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses five canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context layout. See `docs/agents/domain.md`.
