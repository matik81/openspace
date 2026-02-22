# Codex Agent Instructions – OpenSpace

This file defines mandatory project constraints and workflow rules.

Codex must read and follow these instructions before making any changes.

---

# 0. Private Folder Boundary

Codex must treat `.private/` as off-limits.

- Do not read files in `.private/`
- Do not write or modify files in `.private/`
- Do not use `.private/` content as task context unless the user explicitly overrides this rule for a specific file

---

# 1. Architecture

This project must be implemented as:

- Modular monolith
- pnpm workspace monorepo
- Turborepo task runner

Structure:

apps/
  web (Next.js)
  api (NestJS)
packages/
  shared (types, enums, schemas)
infra/
  docker/

---

# 2. Core Requirements

## Email Verification

Email verification is mandatory.
Users must have emailVerifiedAt not null.
Until verified:
- No login access
- No workspace visibility
- No invitation acceptance

Hard gate.

---

## Workspace Visibility Rules

Users can see a workspace only if:

- They are ACTIVE members
OR
- They have a PENDING invitation matching their email

No public workspace listing.
No enumeration possible.

---

## Workspace Timezone

Each workspace has a timezone.
- Bookings stored as timestamptz (UTC)
- Displayed using workspace timezone
- Admin configures timezone

---

## Booking Overlap Protection

Booking overlap must be prevented at database level.

Use PostgreSQL:

- Enable extension: btree_gist
- Use tstzrange
- Add EXCLUDE constraint
- Partial index only for ACTIVE bookings

Overlap safety must be concurrency-proof.

---

## Cancellation Policy

Users can cancel only reservations scheduled on the current workspace day or in the future.
Past reservations cannot be cancelled.
Reservation cancellation performs a definitive hard delete from the database.

---

## Roles

Workspace roles:
- ADMIN
- MEMBER

Only ADMIN can:
- Invite users
- Create rooms
- Promote other admins (future feature)

---

# 3. Quality Requirements

Definition of Done:

- Lint passes
- Typecheck passes
- Tests pass
- CI passes
- Documentation updated

After major changes:
- Run relevant commands
- Fix failures before proceeding

---

# 4. Testing Requirements

Minimum:

- Unit tests for services
- Integration tests for booking overlap logic
- Integration tests for invitation flow
- Auth tests

Use test database.

---

# 5. Error Format

Errors must follow consistent structure:

{
  "code": "ERROR_CODE",
  "message": "Human readable message"
}

Example:
BOOKING_OVERLAP
EMAIL_NOT_VERIFIED
UNAUTHORIZED
WORKSPACE_NOT_VISIBLE
