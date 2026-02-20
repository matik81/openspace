# OpenSpace

OpenSpace is a multi-tenant meeting room booking web application built with a modern TypeScript full-stack architecture.

It is designed as a portfolio-grade project demonstrating:

- Clean modular monolith architecture
- Multi-tenant access control
- Email verification with hard access gate
- Invitation-based workspace visibility
- PostgreSQL overlap-safe booking constraint
- CI/CD with GitHub Actions
- Unit and integration testing
- Internationalization-ready frontend
- Future-ready Android API compatibility

---

## Tech Stack

### Frontend
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- next-intl (i18n support)

### Backend
- NestJS
- Prisma ORM
- PostgreSQL
- JWT authentication (access + refresh tokens)

### Infrastructure
- pnpm workspaces
- Turborepo
- Docker (Postgres + Redis)
- GitHub Actions CI

---

## Core Domain Concepts

### Users
- Register with first name, last name, email, password
- Email verification required (hard block until verified)

### Workspaces
- A user can create a workspace and becomes ADMIN
- Workspace visibility is strictly limited:
  - Only ACTIVE members
  - Or users invited via email
- Workspace has a configurable timezone
- Workspace supports multiple rooms

### Invitations
- Admin invites users by email
- Only users whose email matches the invitation can see the workspace
- Invitations appear directly in the workspace list
- Users can Accept or Reject invitations

### Rooms
- Created and configured by workspace ADMIN
- Name + short description

### Bookings
Members can:
- Select date
- Select start and end time
- Add subject
- Set criticality: HIGH | MEDIUM | LOW

Rules:
- No overlapping bookings per room
- Overlap prevented at database level
- Soft cancellation (status change, not deletion)
- Bookings stored as timestamptz in UTC
- Displayed in workspace timezone

---

## Security Model

- Email verification required before any access
- JWT access + refresh token rotation
- Role-based access control (ADMIN / MEMBER)
- Workspace isolation
- DB-level overlap constraint
- No workspace enumeration

---

## Development

### Install dependencies
pnpm install

### Start local database
pnpm db:up

### Run development
pnpm dev

### Run tests
pnpm test

---

## CI

GitHub Actions pipeline runs:
- Install
- Lint
- Typecheck
- Tests
- Prisma migrations
- Build