# Testing

`mise run check` runs lint, formatting, types, Vitest, Playwright, contract and generated-artifact checks, build, and workflow lint. CI runs the same check after installing Chromium.

## API

`apps/api/src/contract.test.ts` validates real HTTP responses against OpenAPI. Add a contract test for each response scenario of every new operation, including distinct error scenarios sharing a status code. Tests named `contract.test.ts` or `*.contract.test.ts` must use real HTTP; `mise run check:contract-http` rejects `inject()` calls in those files. Reviewers must still check scenario coverage and test semantics. Other test files may use Fastify injection where real HTTP is not required by the specification.

Integration tests use SQLite and controlled clocks and failures where the behavior requires them. For booking retries, exercise failures both before the request reaches the server and after persistence but before the response reaches the client.

## Web and end-to-end

`apps/web` uses Vitest, jsdom and Testing Library for user-visible states and interactions. Tests requiring Mantine's `matchMedia` stub provide one in setup. `e2e/` uses Playwright and Chromium for the main booking, recovery, management and event-list flows.

Playwright starts a dedicated in-memory API and web server and runs test files with one worker because they share that database. For concurrent worktrees, give each run a distinct pair of free ports, for example:

```sh
E2E_API_PORT=3320 E2E_WEB_PORT=5320 mise run test:e2e
```

These settings affect Playwright's servers only; they are not configuration for the regular `mise run dev` daemons. Install the browser with `mise run test:e2e:install` when needed.

## Visual verification

For UI work with a design reference, use the workflow in `docs/design/README.md`. Functional tests do not establish visual fidelity. Add or update visual regression tests for stable, representative screens and states when an approved design-matching baseline is available; capture deterministic viewport, data, time, fonts and browser. Review baseline changes against the design before accepting them. Do not approve the current UI as the baseline merely because a screenshot test passes.
