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
- Tooling: pnpm, Turborepo, TypeScript, ESLint, Jest
- Local infra: Docker Compose for PostgreSQL

Current note:
- PostgreSQL is required by the application and by API integration tests.

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

## Workspace Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
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
- Cancelled accounts are reactivated on re-registration with the same email and must verify email again.
- Password reset is token-based.
- Password changes require the current password.
- Refresh tokens are persisted server-side and revoked on logout.
- The web app uses proxy routes for login, refresh, logout, account update, password reset, and account deletion.

Current limitation:
- Email delivery uses `ConsoleEmailProvider`, which logs verification and reset tokens locally. A real provider is not wired yet.

## Core Domain Rules

- Workspace visibility is limited to active members or pending invitees whose email matches the authenticated user.
- Workspaces, rooms, bookings, and users use logical cancellation rather than permanent deletion.
- Workspace names are unique only among active workspaces.
- Room names are unique only among active rooms within the same workspace.
- Bookings are stored in UTC and evaluated in the workspace timezone.
- Bookings must start and end on the same local workspace date.
- Bookings must stay within the workspace daily schedule window.
- Booking times must align to 15-minute increments.
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

## Web Frontend

User-facing pages:

- `/`
- `/login`
- `/register`
- `/verify-email`
- `/dashboard`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/admin`

Implemented web behavior:

- Public auth modal supports login, registration, email verification, and password reset.
- Dashboard shows visible workspaces and pending invitations.
- Workspace page supports room browsing, booking creation, booking update, booking cancellation, and invitation accept/reject for pending invitees.
- Admin page supports workspace settings, room CRUD, invitation creation, active member listing, and pending invitation listing.
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

- API unit and integration tests exist and run in CI.
- `apps/web` test script is currently a placeholder.
- `packages/shared` test script is currently a placeholder.

CI workflow:

- installs dependencies
- runs lint
- runs Prisma generate
- runs typecheck
- runs Prisma migrations
- runs tests
- runs build

CI currently provisions PostgreSQL for the API integration suites and full-stack E2E environment.
