# OpenSpace

OpenSpace is a modular monolith built as a `pnpm` workspace monorepo with Turborepo.

## Monorepo Structure

```text
apps/
  api      NestJS + Prisma
  web      Next.js App Router + Tailwind CSS
packages/
  shared   Shared enums, types, and contracts
infra/
  docker   Local PostgreSQL compose setup
docs/
  *.md     Technical and functional documentation
```

## Current Stack

- Backend: NestJS, Prisma, PostgreSQL
- Frontend: Next.js App Router, React 18, Tailwind CSS
- Shared package: TypeScript contracts and enums consumed by API and web
- Tooling: pnpm, Turborepo, TypeScript, ESLint, Prettier
- Testing: Jest, Vitest, Playwright
- Local infra: Docker Compose for PostgreSQL

Current note:

- PostgreSQL is required by the application, API integration tests, and full-stack Playwright E2E.

## Quick Start

1. Install dependencies:
   - `pnpm install`
2. Start local infrastructure:
   - `pnpm db:up`
3. Configure API environment:
   - copy `apps/api/.env.example` to `apps/api/.env`
4. Configure frontend environment:
   - copy `apps/web/.env.example` to `apps/web/.env.local`
5. Run development:
   - `pnpm dev`

Default local URLs:

- web: `http://localhost:3000`
- api: `http://localhost:3001`
- Prisma Studio via `pnpm dev:chrome`: `http://localhost:5555`

Local `dev:chrome` helper:

- `pnpm dev:chrome` starts Docker PostgreSQL, applies Prisma migrations, seeds the schema configured for the local API by default, launches the app, opens Prisma Studio, and then opens Chrome
- `pnpm dev:chrome` also opens `/dev-chrome-helper.html`, a manual-inspection helper with seeded credentials, copy buttons, and quick links into the main frontend states
- the helper seed now includes 20+ users distributed across owner, delegated admin, active member, invited, inactive former-member, unverified, cancelled, and empty-dashboard scenarios
- set `DEV_CHROME_SCHEMA` only when you explicitly want to redirect the seed into a different PostgreSQL schema
- seeded demo login: `playwright.admin@example.com` / `Password123!`
- seeded demo workspaces include `playwright.hq`, `managed-ops`, and `playwright-invite`
- override `DEV_CHROME_SCHEMA`, `DEV_CHROME_DATABASE_URL`, or `DEV_CHROME_SEED_COMMAND=none` when you need a different local setup

## Workspace Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:web`
- `pnpm test:web:e2e:mock`
- `pnpm test:web:e2e:fullstack`
- `pnpm build`
- `pnpm format`
- `pnpm db:up`
- `pnpm db:down`

## Implemented Authentication

API endpoints under `/api/auth`:

- `POST /api/auth/register`
- `GET /api/auth/register-status`
- `POST /api/auth/verify-email`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/update-account`
- `POST /api/auth/delete-account`

Implemented behavior:

- Email verification is mandatory before login.
- Unverified users are blocked from authenticated workspace flows even if a token is forged.
- Cancelled accounts are reactivated on re-registration with the same email and must verify email again.
- Registration restart for active unverified accounts rotates verification tokens and invalidates previous unconsumed ones.
- Password reset is token-based.
- Password changes require the current password.
- Refresh tokens are persisted server-side and revoked on logout.
- The web app uses proxy routes for registration, verification, login, refresh, logout, account update, password reset, and account deletion.

Current email delivery behavior:

- `console` is the default provider in development and test environments.
- `resend` is the production-oriented provider and is selected by environment validation when configured for production use.

## Core Domain Rules

- Workspace visibility is limited to active members or pending invitees whose email matches the authenticated user.
- Workspaces, rooms, bookings, and users use logical cancellation rather than permanent deletion.
- Workspace display names can repeat.
- Workspace web-address slugs are unique only among active workspaces.
- Room names are unique only among active rooms within the same workspace.
- Visible workspace ordering is persisted per user.
- Bookings are stored in UTC and evaluated in the workspace timezone.
- Bookings must start and end on the same local workspace date.
- Bookings must stay within the workspace daily schedule window.
- Bookings must align to 15-minute increments.
- Active booking overlap is blocked at the database level for:
  - same room
  - same user inside the same workspace
- Overlapping bookings by the same user in different workspaces are allowed.
- Booking cancellation is allowed only for same-day and future reservations in workspace-local time.
- Room cancellation logically cancels future bookings in that room with reason `ROOM_UNAVAILABLE`.
- Workspace schedule changes preserve history and logically cancel only future bookings that become incompatible.

## Implemented Workspace and Room API

Workspace endpoints:

- `POST /api/workspaces`
- `GET /api/workspaces`
- `POST /api/workspaces/order`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `POST /api/workspaces/:workspaceId/cancel`
- `POST /api/workspaces/:workspaceId/leave`
- `POST /api/workspaces/:workspaceId/invitations`
- `GET /api/workspaces/:workspaceId/admin-summary`
- `GET /api/workspaces/:workspaceId/members`
- `GET /api/workspaces/:workspaceId/invitations`
- `POST /api/workspaces/invitations/:invitationId/accept`
- `POST /api/workspaces/invitations/:invitationId/reject`

Room endpoints:

- `POST /api/workspaces/:workspaceId/rooms`
- `GET /api/workspaces/:workspaceId/rooms`
- `GET /api/workspaces/:workspaceId/rooms/:roomId`
- `PATCH /api/workspaces/:workspaceId/rooms/:roomId`
- `DELETE /api/workspaces/:workspaceId/rooms/:roomId`

Administrative cancellation flows use confirmation payloads and remain logical cancellations.

## Implemented Booking API

- `GET /api/workspaces/:workspaceId/bookings`
- `POST /api/workspaces/:workspaceId/bookings`
- `PATCH /api/workspaces/:workspaceId/bookings/:bookingId`
- `POST /api/workspaces/:workspaceId/bookings/:bookingId/cancel`

Supported booking listing filters:

- `mine` default `true`
- `includePast` default `false`
- `includeCancelled` default `false`
- `fromDate`
- `toDate`

## Web Frontend

User-facing pages:

- `/`
- `/login`
- `/register`
- `/verify-email`
- `/dashboard`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/control`
- `/[workspaceSlug]`
- `/[workspaceSlug]/control`

Implemented web behavior:

- Public auth UI supports login, registration, email verification, and password reset.
- Dashboard shows visible workspaces and pending invitations.
- Workspace shell supports top-bar workspace switching, room browsing, booking creation, booking update, booking cancellation, and invitation accept or reject actions.
- Control Panel pages support workspace settings, room CRUD, invitation creation, active member listing, pending invitation listing, and admin summary loading.
- Account management is available from the authenticated shell.
- Logout goes through the backend and revokes the refresh token.
- Expired access tokens are refreshed transparently through the web proxy before failing requests back to the UI.

## Testing and CI

Current repository quality gates:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Current automated test coverage:

- API unit and integration tests run with Jest.
- Web unit and component tests run with Vitest and `happy-dom`.
- Web end-to-end suites run with Playwright in both mock and full-stack modes.
- `packages/shared` still has no automated tests.

CI workflow:

- `quality` job installs dependencies, runs lint, Prisma generate, typecheck, Prisma migrate deploy, test, and build
- `e2e-mock` runs Playwright mock-browser tests after the quality job
- `e2e-fullstack` starts Docker Compose, resets and migrates an E2E schema, and runs Playwright full-stack tests after the quality job
