# Testing

Current state and the agreed trigger for the next step.

## Today

- `apps/api` carries the tests: smoke tests (`app.test.ts`) and contract tests (`contract.test.ts`). Every new API operation needs a contract test for each response scenario (see `docs/adr/0001-technology-stack.md`).
- `apps/web` has no test infrastructure yet. This is deliberate while its pages are static stubs — a test would only re-check markup.

## Trigger for web test tooling

Add Vitest + Testing Library to `apps/web` as soon as the booking flow gets its first interactive state (date/slot selection, a form). From that moment front-end behaviour can regress, so it must be guarded.

Setup rules for that task:

- Put Vitest in the root `pnpm run test` integration (or extend it with a `test:web` script), so one `mise run check` still runs everything.
- Do not test static stub pages; wait for state or logic.
- Keep the existing contract-test flow unchanged.
