# Architecture Overview

OpenSpace uses a modular monolith architecture.

---

## Backend (NestJS)

Modules:

- auth
- users
- workspaces
- invitations
- rooms
- bookings

Each module contains:
- controller
- service
- dto
- tests

Prisma handles database layer.

---

## Database

PostgreSQL.

Key design decisions:

- Multi-tenant via workspaceId
- EXCLUDE constraint for booking overlap
- Soft delete via status field
- UUID primary keys

---

## Frontend (Next.js)

App Router structure:

- /login
- /register
- /verify-email
- /dashboard
- /workspaces/[id]
- /workspaces/[id]/admin

Internationalization ready.

---

## Mobile Compatibility

Backend is API-first.
Swagger/OpenAPI enabled.
Android app can consume same endpoints.
