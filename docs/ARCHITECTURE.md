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
- Soft delete via status field for users, workspace, rooms and bookings
- Partial unique indexes enforce workspace names only for active workspaces and room names only for active rooms in a workspace
- UUID primary keys
- Configurable backend limits and persisted rate-limit suspensions
- Workspace schedule history with effective dates
- Password reset tokens persisted separately from email verification tokens
- Cancelled users can be reactivated by registering again with the same email

Business constraints:

- Maximum 10 active workspaces per user
- Maximum 100 active rooms per workspace
- Maximum 1000 active members per workspace
- Maximum 1000 pending invitations per workspace
- Maximum 1000 active future bookings per user in each workspace
- Bookings allowed up to 365 days from today
- Registration and create operations use hourly counters and 24h suspensions

---

## Frontend (Next.js)

App Router structure:

- /login
- /register
- /verify-email
- password reset flow inside the public auth modal
- /dashboard
- /workspaces/[id]
- /workspaces/[id]/admin

Frontend account management:

- User menu in the top-right header
- Account modal for first name, last name and password update
- Delete account action reachable from the account modal

Internationalization ready.

---

## Mobile Compatibility

Backend is API-first.
Swagger/OpenAPI enabled.
Android app can consume same endpoints.
