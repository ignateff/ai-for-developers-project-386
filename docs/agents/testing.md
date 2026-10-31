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

Elements whose visible text is localized or formatted (dates, counts, times) get a stable `aria-label` carrying the machine value (e.g. an ISO date on calendar day buttons), and e2e selectors target role plus that stable name rather than the rendered text. When changing visible UI text, grep `e2e/` and `*.test.*` for the old string first.

When a test switches between dialogs, wait for the previous dialog to close and scope actions to the active dialog. This avoids interacting with a closing dialog during its transition.

## Visual verification

For UI work with a design reference, use the workflow in `docs/design/README.md`. Functional tests do not establish visual fidelity. Add or update visual regression tests for stable, representative screens and states when an approved design-matching baseline is available; capture deterministic viewport, data, time, fonts and browser. Review baseline changes against the design before accepting them. Do not approve the current UI as the baseline merely because a screenshot test passes.

Use representative data that exercises the layout, including multiple items where they affect columns or spacing. Record separately which viewport sizes were compared with a design reference and which were only checked for regressions; report missing reference sizes as a limitation.

`e2e/00-visual.spec.ts` holds the approved baselines for the screens in `docs/design/calendar-booking.pen` (desktop 1400×900 and narrow 390×844). Determinism comes from `CALENDAR_FIXED_NOW` (set in `playwright.config.ts`, window starts 2026-03-27 as in the design) and the bundled Inter font. The `00-` prefix matters: the file must run first because baselines assume a pristine in-memory database. Playwright keeps baselines per platform (`-darwin`, `-linux`); regenerate them with `mise run test:e2e:visual:update` for the current platform and `mise run test:e2e:visual:update:linux` for CI (requires Docker). Review every baseline against the `.pen` frames before committing.
