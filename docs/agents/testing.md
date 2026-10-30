# Testing

Where tests live today and what the next step is.

## Today

- `apps/api` carries contract and smoke tests (`app.test.ts`, `contract.test.ts`). Every new API operation needs a contract test for each response scenario (see `docs/adr/0001-technology-stack.md`).
- `apps/web` uses Vitest with jsdom and Testing Library (decision fixed at stack level in `docs/adr/0001-technology-stack.md`). Test files carry the `// @vitest-environment jsdom` pragma, so no per-project Vitest config is needed; root `pnpm run test` picks them up. Current coverage: the landing page (hero heading, CTA link to `/book`, availability list) and layout navigation hrefs (`apps/web/src/pages/main/main.test.tsx`, `apps/web/src/widgets/layout/layout.test.tsx`).
- jsdom lacks `window.matchMedia`, which Mantine components consult; the test files provide a stub in `beforeAll`.

## Rules

- Stubs without behaviour (currently `/book` and `/events`) get no tests; test state, logic, and routes.
- Web tests run through the regular `mise run check`, so one command covers both apps locally and in CI.
- When the booking flow grows real behaviour, follow the contract-test discipline: each response scenario gets a test.
