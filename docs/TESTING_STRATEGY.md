# Testing Strategy

## Current Automated Coverage

Automated tests currently exist in both `apps/api` and `apps/web`.

Covered areas:

- API unit tests for auth, health, email provider selection, environment validation, and the global exception filter
- API integration tests for auth flows, invitation flows, domain rules, booking overlap rules, and rate limits
- web unit and component tests for time helpers, workspace routing, public auth UI, account settings, workspace shell, calendar rendering, and sidebar behavior
- web Playwright mock E2E for public home, dashboard, session handling, workspace admin, and workspace booking flows
- web Playwright full-stack E2E for auth and dashboard, workspace admin, and workspace booking flows

Current gaps:

- `packages/shared` still has no automated tests
- API integration coverage depends on PostgreSQL availability

## Current Integration Coverage

The API integration suite currently covers:

- email verification flow
- registration restart for active unverified accounts with verification token rotation
- cancelled account reactivation on register
- invitation-based registration with automatic email verification
- account update flow
- password reset request flow
- password reset confirmation flow
- invitation accept flow
- invitation reject flow
- workspace visibility rules
- workspace leave flow with future booking cancellation
- account deletion flow with logical cancellation propagation
- booking creation
- booking overlap rejection
- user double-booking rejection inside a workspace
- cross-workspace overlapping bookings allowed
- booking hours enforcement based on workspace schedule
- booking local-date boundary enforcement
- booking 15-minute increment enforcement
- booking list filtering and visibility rules
- booking logical cancellation behavior and past-mutation guard
- workspace schedule change cancellation for incompatible future bookings
- rate-limit suspension responses
- workspace, room, invitation, member, and future-booking limit enforcement

## Current Frontend Coverage

The web test suite currently includes:

- Vitest with `happy-dom` for component and utility tests
- Playwright `e2e-mock` suites that run against the Next.js app with mocked backend behavior
- Playwright `e2e-fullstack` suites that boot the real API and web apps against PostgreSQL
- public auth coverage includes both standard registration and invitation registration flows

Current note:

- `pnpm test` runs the workspace test scripts, including API Jest tests and web Vitest tests
- Playwright suites are executed separately through `pnpm test:web:e2e:mock` and `pnpm test:web:e2e:fullstack`

## Local Execution

Repository commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:web:e2e:mock`
- `pnpm test:web:e2e:fullstack`

Infrastructure requirements:

- PostgreSQL must be reachable for API integration tests
- local Docker setup can be started with `pnpm db:up`
- full-stack Playwright tests also require Docker-backed PostgreSQL or an equivalent local database

Current note:

- the local Docker setup exposes PostgreSQL on `localhost:5432` by default via `infra/docker/.env`
- `packages/shared` test script still prints `No tests yet for shared`

## CI

Current GitHub Actions workflow runs three jobs:

- `quality`: dependency installation, lint, Prisma generate, typecheck, Prisma migrate deploy, test, and build
- `e2e-mock`: Playwright mock E2E after `quality`
- `e2e-fullstack`: Docker Compose startup, E2E schema migration, and Playwright full-stack E2E after `quality`

The CI workflow provisions PostgreSQL for API integration coverage and for the full-stack Playwright environment.

## Testing Direction

Near-term priorities:

- add automated tests for `packages/shared`
- expand web coverage around route handlers and auth proxy edge cases
- keep integration and E2E scenarios deterministic with timezone-aware test data
- preserve coverage for destructive confirmations, booking rules, and invitation visibility when refactoring
