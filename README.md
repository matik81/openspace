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
- Booking overlap is blocked at DB level with `btree_gist`, `tstzrange`, and partial active-only exclusion.
- Bookings are cancelled via status (`ACTIVE`, `CANCELLED`) and never hard deleted.

## Workspace API (Implemented)

- `POST /api/workspaces` creates a workspace and the creator is added as `ADMIN`.
- `GET /api/workspaces` lists only visible workspaces:
  - active membership
  - pending invitation matching authenticated user email
- `POST /api/workspaces/:workspaceId/invitations` invites a user email (admin-only).
- `POST /api/workspaces/invitations/:invitationId/accept` accepts an invitation.
- `POST /api/workspaces/invitations/:invitationId/reject` rejects an invitation.

All workspace endpoints enforce verified email and return errors in `{ code, message }` format.

## Room API (Implemented, Admin Only)

- `POST /api/workspaces/:workspaceId/rooms` creates a room.
- `GET /api/workspaces/:workspaceId/rooms` lists workspace rooms.
- `GET /api/workspaces/:workspaceId/rooms/:roomId` gets a room.
- `PATCH /api/workspaces/:workspaceId/rooms/:roomId` updates a room.
- `DELETE /api/workspaces/:workspaceId/rooms/:roomId` deletes a room when no bookings exist.

## Web Frontend (Implemented)

- `GET /register` user registration page connected to `POST /api/auth/register`.
- `GET /verify-email` email verification page connected to `POST /api/auth/verify-email`.
- `GET /login` login page connected to `POST /api/auth/login`.
- `GET /dashboard` workspace visibility page connected to:
  - `GET /api/workspaces`
  - `POST /api/workspaces/invitations/:invitationId/accept`
  - `POST /api/workspaces/invitations/:invitationId/reject`
- Dashboard highlights pending invitations and provides Accept/Reject actions.

## Booking API (Implemented)

- `POST /api/workspaces/:workspaceId/bookings` creates an `ACTIVE` booking.
- `POST /api/workspaces/:workspaceId/bookings/:bookingId/cancel` soft-cancels booking by setting status to `CANCELLED`.
- Overlap violations return `{ code: "BOOKING_OVERLAP", message: "..." }` from PostgreSQL exclusion constraints.
