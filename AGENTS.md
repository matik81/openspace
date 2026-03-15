# Coding Agent Instructions - OpenSpace

This file defines mandatory project constraints and workflow rules for repository work.

Additional project guidance lives in `docs/`.

Relevant files include:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_BRIEF.md`
- `docs/TESTING_STRATEGY.md`

## 0. Private Folder Boundary

The coding agent must treat `.private/` as off-limits.

- do not read files in `.private/`
- do not write or modify files in `.private/`
- do not use `.private/` content as task context unless the user explicitly overrides this rule for a specific file

## 1. Architecture

This project is implemented as:

- modular monolith
- `pnpm` workspace monorepo
- Turborepo task runner

Structure:

```text
apps/
  web
  api
packages/
  shared
infra/
  docker
```

## 2. Core Requirements

### Email Verification

Email verification is mandatory.

- users must have `emailVerifiedAt` not null before login
- unverified users cannot log in
- unverified users cannot access authenticated workspace flows
- invitation acceptance requires an authenticated verified user

### Workspace Visibility Rules

Users can see a workspace only if:

- they are active members
- or they have a pending invitation matching their authenticated email

No public workspace listing exists.

### Workspace Timezone

Each workspace has a timezone.

- bookings are stored in UTC
- bookings are displayed using workspace timezone
- admins configure workspace timezone and daily schedule window

### Booking Overlap Protection

Booking overlap must be prevented at the database level.

Use PostgreSQL:

- `btree_gist`
- `tstzrange`
- exclusion constraints
- active-only partial enforcement

Overlap safety must remain concurrency-safe.

### Cancellation Policy

Users can cancel reservations scheduled on the current workspace day or in the future.
Reservation cancellation is logical and preserves the record with `status=CANCELLED`.

Workspace and room destructive flows are also logical cancellations, not permanent deletes.

### Roles

Workspace roles:

- `ADMIN`
- `MEMBER`

Only `ADMIN` can:

- invite users
- create rooms
- manage workspace settings

## 3. Quality Requirements

Definition of Done:

- lint passes
- typecheck passes
- tests pass
- CI passes
- documentation updated

Repository language policy:

- use professional technical English for source code and documentation
- do not introduce non-English text unless it is intentional user-facing product content

After major changes:

- run relevant commands
- fix failures before proceeding

## 4. Testing Requirements

Minimum expectations:

- unit tests for critical services
- integration tests for auth flows
- integration tests for booking overlap and scheduling rules
- integration tests for invitation and visibility rules

Use a test database for integration coverage.

Current gap:

- frontend and shared-package automated tests are still missing

## 5. Error Format

Errors must follow this structure:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message"
}
```

Examples:

- `BOOKING_OVERLAP`
- `EMAIL_NOT_VERIFIED`
- `UNAUTHORIZED`
- `WORKSPACE_NOT_VISIBLE`

## 6. Commit Messages

Commit messages must use Conventional Commits with a mandatory scope.

Format:

`type(scope): summary`

Examples:

- `feat(api): enforce email verification on login`
- `fix(web): hide workspace data from non-members`
- `test(api): cover booking overlap constraint`

## 7. Git Safety

Before pushing to `main`, the coding agent must always ask for explicit confirmation from the operator.

- do not push to `main` without a direct user confirmation in the current conversation
- this confirmation requirement applies even if the requested changes are already committed and ready
