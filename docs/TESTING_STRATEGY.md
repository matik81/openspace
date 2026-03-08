# Testing Strategy

## Current Automated Coverage

Current automated tests are concentrated in `apps/api`.

Covered areas:

- auth service behavior
- auth controller behavior
- global exception filter
- environment validation
- auth flow integration
- workspace invitation flow integration
- domain rules integration
- booking overlap and scheduling integration
- rate-limit suspension integration

Current gaps:

- `apps/web` has no automated tests yet
- `packages/shared` has no automated tests yet

## Current Integration Coverage

The API integration suite currently covers:

- email verification flow
- cancelled account reactivation on register
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
- booking 15-minute increment enforcement
- booking logical cancellation behavior and past-mutation guard
- workspace schedule change cancellation for incompatible future bookings
- rate-limit suspension responses

## Local Execution

Repository commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Infrastructure requirements for API integration tests:

- PostgreSQL must be reachable
- local Docker setup can be started with `pnpm db:up`

Current note:

- web and shared test scripts are placeholders and currently print `No tests yet`

## CI

Current CI workflow runs:

- dependency installation
- lint
- Prisma generate
- typecheck
- Prisma migrate deploy
- test
- build

The GitHub Actions workflow provisions PostgreSQL for the API integration suites.

## Testing Direction

Near-term priorities:

- add frontend tests for auth proxy routes and session refresh behavior
- add frontend tests for destructive confirmations and booking workflows
- add shared package tests for contracts and value-level invariants
- keep integration tests deterministic with timezone-aware test data
