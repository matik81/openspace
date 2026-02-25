# OpenSpace

OpenSpace is a modular monolith implemented as a `pnpm` workspace monorepo with Turborepo.

## Monorepo Structure

```text
apps/
  api      NestJS + Prisma
  web      Next.js App Router + Tailwind
packages/
  shared   Shared enums, types, and contracts
infra/
  docker   Postgres + Redis compose setup
```

## Quick Start

1. Install dependencies:
   - `pnpm install`
2. Start local infrastructure:
   - `pnpm db:up`
3. Configure API environment:
   - Copy `apps/api/.env.example` to `apps/api/.env`.
   - `REDIS_URL` defaults to `redis://localhost:6379` in development if omitted, but you can set it explicitly.
4. Configure frontend environment:
   - Copy `apps/web/.env.example` to `apps/web/.env.local` (or `.env`) and keep `OPENSPACE_API_BASE_URL=http://localhost:3001` for local development.
5. Run development:
   - `pnpm dev`

## Workspace Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm format`

## Core Domain Guardrails

- Email verification is a hard gate (`emailVerifiedAt` must be present).
- Workspace visibility is restricted to active members or invited emails.
- Bookings are stored in UTC (`timestamptz`) and displayed with workspace timezone.
- Room booking overlap is blocked at DB level with `btree_gist`, `tstzrange`, and partial active-only exclusion.
- User double-booking within the same workspace (same user, overlapping active bookings) is blocked at DB level with an active-only exclusion constraint.
- Booking creation is restricted to `07:00`-`22:00` in the workspace timezone.
- Booking start/end times must align to 15-minute increments in the workspace timezone.
- Booking cancellation is allowed for past, same-day, and future reservations.
- Booking cancellation permanently removes the reservation record (hard delete).

## Workspace API (Implemented)

- `POST /api/workspaces` creates a workspace and the creator is added as `ADMIN`.
- `GET /api/workspaces` lists only visible workspaces:
  - active membership
  - pending invitation matching authenticated user email
- `POST /api/workspaces/:workspaceId/invitations` invites a user email (admin-only).
- `GET /api/workspaces/:workspaceId/members` lists active workspace members (admin-only).
- `GET /api/workspaces/:workspaceId/invitations` lists pending workspace invitations (admin-only).
- `POST /api/workspaces/invitations/:invitationId/accept` accepts an invitation.
- `POST /api/workspaces/invitations/:invitationId/reject` rejects an invitation.

All workspace endpoints enforce verified email and return errors in `{ code, message }` format.

## Room API (Implemented, Admin Only)

- `POST /api/workspaces/:workspaceId/rooms` creates a room.
- `GET /api/workspaces/:workspaceId/rooms` lists workspace rooms (active member read access).
- `GET /api/workspaces/:workspaceId/rooms/:roomId` gets a room (active member read access).
- `PATCH /api/workspaces/:workspaceId/rooms/:roomId` updates a room.
- `DELETE /api/workspaces/:workspaceId/rooms/:roomId` permanently deletes a room and all associated reservations.
  - Requires admin confirmation payload: `roomName`, `email`, and `password`.

## Web Frontend (Implemented)

- `GET /register` user registration page connected to `POST /api/auth/register`.
- `GET /verify-email` email verification page connected to `POST /api/auth/verify-email`.
- `GET /login` login page connected to `POST /api/auth/login`.
- `GET /dashboard` workspace visibility page connected to:
  - `POST /api/workspaces`
  - `GET /api/workspaces`
  - `POST /api/workspaces/invitations/:invitationId/accept`
  - `POST /api/workspaces/invitations/:invitationId/reject`
- Dashboard supports creating workspaces, highlights pending invitations, and provides Accept/Reject actions.
- Sidebar-based workspace navigation is shared across `/dashboard`, `/workspaces/[workspaceId]`, and `/workspaces/[workspaceId]/admin`.
- `/workspaces/[workspaceId]` supports invitation acceptance/rejection for pending users and reservation management for active members.
- `/workspaces/[workspaceId]/admin` supports room CRUD, active member listing, pending invitation listing, and invite-by-email.
- Room deletion uses a styled confirmation modal and requires room name + admin email + password before the backend performs a permanent delete of the room and its reservations.

## Booking API (Implemented)

- `POST /api/workspaces/:workspaceId/bookings` creates an `ACTIVE` booking.
  - Enforces same-local-day booking and local booking hours (`07:00`-`22:00`).
  - Enforces 15-minute time increments in the workspace timezone.
  - Rejects overlapping active bookings for the same room.
  - Rejects overlapping active bookings for the same user across rooms within the same workspace.
  - Allows overlapping bookings by the same user in different workspaces.
- `GET /api/workspaces/:workspaceId/bookings` lists bookings with filters:
  - `mine` (default `true`)
  - `includePast` (default `false`)
  - `includeCancelled` (default `false`)
- `POST /api/workspaces/:workspaceId/bookings/:bookingId/cancel` permanently deletes a reservation when its workspace-local booking date is today or in the future.
- Room overlap violations return `{ code: "BOOKING_OVERLAP", message: "..." }`.
- User double-booking violations return `{ code: "BOOKING_USER_OVERLAP", message: "..." }`.
