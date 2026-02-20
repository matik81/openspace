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
3. Run development:
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
