# Coding Agent Instructions - OpenSpace

This file defines mandatory project constraints and workflow rules for repository work.

Additional project guidance lives in `docs/`.

Relevant files include:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_BRIEF.md`
- `docs/TESTING_STRATEGY.md`
- `docs/CODEX_AGENTS.md`

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
- web automated coverage for user-critical UI and session flows

Use a test database for integration coverage.

Current repository status:

- `apps/api` has Jest unit and integration coverage
- `apps/web` has Vitest component and utility coverage plus Playwright E2E suites
- `packages/shared` automated tests are still missing

When changing shared contracts or business-critical UI flows, extend the relevant existing tests instead of documenting the gap away.

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

## 8. Main Agent Orchestration Policy

The main agent is responsible for orchestrating work across the repository.

Default operating model:

- the user proposes a feature, fix, refactor, or investigation
- the main agent maps the impacted area
- the main agent delegates relevant subtasks to the most appropriate custom agents
- the main agent integrates outcomes into a coherent final result
- the main agent closes the task only after considering code, tests, documentation, and review needs

The main agent must not spawn every custom agent by default.

Instead:

- delegate only the agents that are materially relevant to the request
- prefer narrow, role-specific delegation over broad fan-out
- keep a single implementation owner for each code area being changed
- use read-only agents for mapping, documentation research, and review

Expected orchestration sequence:

1. map the request before editing, using the most appropriate mapper when the impacted code path is not already obvious
2. consult the framework documentation researcher when version-sensitive framework or platform behavior could affect correctness
3. assign implementation to the narrowest suitable specialist
4. extend or update the nearest relevant automated tests when behavior changes
5. update technical documentation when implemented behavior, architecture notes, or testing guidance changed
6. run review-oriented agents for risky or business-critical changes
7. run relevant validation commands before considering the task complete

Delegation guidance:

- use `web_mapper` for frontend code-path discovery
- use `api_mapper` for backend code-path discovery
- use exactly one primary implementation agent per touched area
- involve `docs_sync_guard` when a completed change affects documented behavior
- involve `framework_docs_researcher` when official docs are needed to avoid guessing
- involve `agent_system_tuner` when the task is specifically about evolving agent definitions, orchestration policy, model choices, or the multi-agent setup itself
- involve review agents when a task affects auth, authorization, booking rules, timezone handling, schema safety, or other high-risk behavior

Code ownership guidance:

- `ui_builder` owns general frontend UI implementation
- `proxy_session_guard` owns frontend auth proxy, cookie, and session behavior
- `booking_timekeeper` owns frontend booking and timezone-sensitive interaction logic
- `nest_service_builder` owns general backend NestJS implementation
- `auth_policy_guard` owns backend auth and account lifecycle logic
- `workspace_rules_guard` owns workspace visibility, invitations, memberships, rooms, and role rules
- `booking_policy_guard` owns backend booking validation and scheduling logic
- `prisma_schema_guard` owns Prisma schema, migration, and database-constraint changes

Completion standard:

- do not stop after code changes if tests, docs, or review are still clearly needed
- do not treat documentation as optional when behavior or architecture notes changed
- do not leave business-critical changes without checking the nearest relevant automated coverage
- keep the final result behaviorally consistent across frontend, backend, persistence, and documentation layers when the task spans more than one area

See `docs/CODEX_AGENTS.md` for the current custom agent catalog and usage patterns.
