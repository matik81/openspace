# Codex Agents Guide

This document describes the custom Codex agents configured for OpenSpace and how to use them effectively across both the web app and the API.

## Goals

The agent set is designed to:

- keep frontend work scoped and predictable
- keep backend work scoped and predictable
- reduce overlap between UI, auth, booking, testing, and documentation work
- preserve OpenSpace business rules while allowing parallel work

Repository-wide rules still apply to every agent.

Important:

- `.private/` is off-limits unless the user explicitly overrides that rule for a specific file
- documentation must describe implemented behavior, not aspirational behavior
- email verification, workspace visibility, timezone handling, and booking rules are critical product constraints

## Main Agent Policy

The main agent should behave as an orchestrator.

Default expectation:

- map the request first when ownership is not already obvious
- delegate only the agents that are actually relevant
- keep one implementation owner per code area
- bring in test, documentation, and review agents when the change warrants them
- integrate the result instead of treating delegated outputs as separate deliverables

The goal is not to call every agent on every task.

The goal is to cover all relevant aspects of the request with the smallest effective set of agents.

Recommended orchestration order:

1. mapper agent when needed
2. `Lumen` when framework behavior is uncertain or version-sensitive
3. one implementation specialist per touched area
4. test specialist when behavior changed
5. `Ledger` when docs changed materially
6. review agent for risky or business-critical changes

For changes to the multi-agent system itself, involve `Steward`.

Use this principle throughout:

- selective delegation
- clear ownership
- full-stack consistency

## Frontend Agents

### `web_mapper` (`Atlas`)

Use when you need a read-only map of the code path before editing.

Best for:

- locating the real execution path for a bug or feature
- identifying touched routes, components, hooks, helpers, and tests
- deciding which specialist should own the next step

Avoid using it as an implementation agent.

### `ui_builder` (`Canvas`)

Use for frontend implementation work in pages, layouts, components, and hooks.

Best for:

- route-level UI changes in `apps/web/app`
- component updates in `apps/web/components`
- hook updates in `apps/web/hooks`
- focused UX improvements with nearby test updates

Do not use it for proxy/auth internals or booking-timezone-heavy logic unless the change is mostly visual.

### `proxy_session_guard` (`Sentry`)

Use for frontend auth, cookies, refresh flow, and browser-facing proxy routes.

Best for:

- `apps/web/app/api` route handler changes
- login, logout, refresh, and account-state behavior
- session guard issues
- auth-related regressions and error handling

Choose this agent when the behavior depends on verified-user access, cookie updates, or retry-on-401 logic.

### `booking_timekeeper` (`Chronos`)

Use for booking interactions, calendar behavior, and timezone-sensitive UX.

Best for:

- calendar rendering and selection flows
- booking modal behavior
- workspace-local day calculations
- timezone conversions and related payload logic

Choose this agent when UTC versus workspace-local time can affect correctness.

### `playwright_flow_tester` (`Beacon`)

Use for user-flow reproduction and test updates.

Best for:

- Playwright coverage in `apps/web/e2e-mock`
- Playwright coverage in `apps/web/e2e-fullstack`
- tightening regression coverage after a UI or flow fix

Prefer updating existing relevant suites before creating new ones.

### `frontend_reviewer` (`Aegis`)

Use for a final read-only review focused on correctness and regression risk.

Best for:

- finding auth or authorization regressions
- spotting booking or timezone mistakes
- checking whether test coverage is missing
- reviewing risky frontend changes before merge

Use this agent after implementation, not instead of implementation.

### `docs_sync_guard` (`Ledger`)

Use to align technical documentation with the implemented codebase.

Best for:

- updating `docs/ARCHITECTURE.md`
- updating `docs/PROJECT_BRIEF.md`
- updating `docs/TESTING_STRATEGY.md`
- documenting behavior changes after implementation is complete

This agent should update existing docs first and should never invent behavior.

### `framework_docs_researcher` (`Lumen`)

Use when implementation depends on version-sensitive framework behavior.

Best for:

- Next.js App Router questions
- React behavior questions
- Playwright API verification
- NestJS and Prisma documentation checks
- official OpenAI/Codex usage questions

This agent stays read-only and should rely on official documentation only.

### `agent_system_tuner` (`Steward`)

Use when the task is about the agent system itself rather than product functionality.

Best for:

- refining agent prompts and role boundaries
- adjusting model choices or reasoning effort
- evolving orchestration policy
- simplifying overlapping agents
- keeping `.codex` config and agent docs aligned over time

This agent is for governance of the multi-agent setup, not delivery of app features.

## Backend Agents

### `api_mapper` (`Compass`)

Use when you need a read-only map of the backend code path before editing.

Best for:

- tracing controller, service, Prisma, and test ownership
- identifying which API module really owns a bug or feature
- deciding whether the work belongs to auth, workspace rules, booking rules, schema, tests, or review

Avoid using it as an implementation agent.

### `nest_service_builder` (`Forge`)

Use for general NestJS implementation work that is not primarily auth, booking-rule, or Prisma-schema work.

Best for:

- focused controller and service changes
- DTO and module updates
- conventional API behavior changes that stay within established patterns

Do not use it when the heart of the change is auth policy, workspace visibility rules, booking validation, or schema design.

### `auth_policy_guard` (`Sentinel`)

Use for backend authentication, email verification, JWT claims, refresh tokens, and account lifecycle behavior.

Best for:

- login and refresh rules
- verification enforcement
- password reset and account-state transitions
- auth guard and strategy changes

Choose this agent when verified-user access and token lifecycle are part of correctness.

### `workspace_rules_guard` (`Harbor`)

Use for workspace visibility, invitations, memberships, rooms, and ADMIN versus MEMBER permissions.

Best for:

- invitation acceptance and rejection rules
- member visibility and access rules
- room and workspace cancellation behavior
- role-based permissions in workspaces

Choose this agent when the change is mainly about who can see or manage a workspace.

### `booking_policy_guard` (`Anchor`)

Use for backend booking validation, scheduling rules, timezone-sensitive domain logic, and cancellation behavior.

Best for:

- booking validation order
- workspace-local date boundaries
- schedule window enforcement
- logical booking cancellation behavior

Choose this agent when correctness depends on scheduling rules rather than UI rendering.

### `prisma_schema_guard` (`Bedrock`)

Use for Prisma schema, migrations, indexes, constraints, and PostgreSQL-backed safety guarantees.

Best for:

- schema and migration changes
- uniqueness and active-only constraint work
- booking overlap protection at the database layer
- persistence-level support for domain changes

Choose this agent when the change reaches the database contract.

### `api_test_engineer` (`Verifier`)

Use for Jest unit and integration coverage in `apps/api`.

Best for:

- updating existing integration suites
- extending backend unit tests near changed services or helpers
- strengthening domain coverage after API changes

Prefer updating the nearest existing test file before creating a new one.

### `backend_reviewer` (`Rampart`)

Use for a final read-only review focused on backend correctness and risk.

Best for:

- auth and authorization regressions
- booking, timezone, and cancellation-policy mistakes
- schema and migration risks
- missing backend coverage

Use this agent after implementation, not instead of implementation.

## Recommended Patterns

### 1. Small UI task

Recommended flow:

1. `Atlas` maps the impacted files.
2. `Canvas` implements the UI change.
3. `Beacon` or `Aegis` validates coverage and regression risk if the change is not trivial.

Example:

```text
Map the files behind the workspace admin sidebar and then implement a small UI cleanup there. Use Atlas first, then Canvas.
```

### 2. Auth or session bug

Recommended flow:

1. `Atlas` maps the route and helper chain.
2. `Sentry` fixes the proxy/session issue.
3. `Beacon` updates session or auth coverage.
4. `Ledger` updates docs if auth behavior changed materially.

Example:

```text
Investigate why verified users are being logged out after refresh. Have Atlas map the flow, Sentry fix it, and Beacon update the closest regression tests.
```

### 3. Booking or timezone bug

Recommended flow:

1. `Atlas` maps the booking and rendering path.
2. `Chronos` fixes the booking or timezone behavior.
3. `Beacon` updates the nearest booking tests.
4. `Aegis` reviews if the change is high risk.

Example:

```text
Investigate a timezone bug in workspace bookings. Use Atlas to map the code path, Chronos to implement the fix, and Beacon to extend coverage.
```

### 4. Framework uncertainty before coding

Recommended flow:

1. `Lumen` verifies framework behavior in official docs.
2. `Atlas` maps the local code path if needed.
3. `Canvas`, `Sentry`, or `Chronos` implements the change.

Example:

```text
Before changing the Next.js route handler behavior, ask Lumen to verify the framework constraints and then have Sentry implement the change.
```

### 5. Feature completion and closeout

Recommended flow:

1. implementation agent finishes the change
2. `Beacon` updates tests if needed
3. `Aegis` performs a read-only review
4. `Ledger` updates docs impacted by the final behavior

Example:

```text
The workspace invitation flow is ready. Run Aegis for regression review and then Ledger to align the docs with the final implementation.
```

### 6. Generic API feature

Recommended flow:

1. `Compass` maps the affected controller, service, DTO, and tests.
2. `Forge` implements the API change.
3. `Verifier` updates the nearest Jest coverage.
4. `Rampart` reviews if the change is risky.

Example:

```text
Map the API path behind room updates, then implement the change with Forge and extend the closest backend tests with Verifier.
```

### 7. Auth or account-lifecycle bug

Recommended flow:

1. `Compass` maps the auth path.
2. `Sentinel` fixes the auth logic.
3. `Verifier` updates auth unit or integration coverage.
4. `Ledger` updates docs if the implemented auth behavior changed materially.

Example:

```text
Investigate a login issue related to email verification. Use Compass to map it, Sentinel to fix it, and Verifier to tighten the auth integration coverage.
```

### 8. Workspace visibility or invitation bug

Recommended flow:

1. `Compass` maps the workspace and invitation flow.
2. `Harbor` fixes the domain rule.
3. `Verifier` updates the nearest integration suite.
4. `Rampart` reviews if permissions or visibility were touched.

Example:

```text
Investigate why a user can still see a workspace after membership becomes inactive. Use Compass, then Harbor, then Verifier.
```

### 9. Booking rule or scheduling bug

Recommended flow:

1. `Compass` maps the booking path.
2. `Anchor` fixes the service-layer rule.
3. `Bedrock` joins only if schema or constraint work is required.
4. `Verifier` updates booking integration coverage.

Example:

```text
Investigate a booking rule bug around local-day boundaries. Have Compass map it, Anchor implement the fix, and Verifier extend the integration test.
```

### 10. Schema-backed domain change

Recommended flow:

1. `Compass` maps the affected code and tests.
2. `Bedrock` handles schema and migration work.
3. domain specialist agent updates service logic if needed.
4. `Verifier` extends the relevant integration coverage.
5. `Rampart` reviews the safety of the change.

Example:

```text
We need a schema-backed change to workspace persistence. Use Compass first, then Bedrock for Prisma and migration work, and Verifier for coverage.
```

## Choosing The Right Agent

Use this quick rule of thumb:

- if you do not know where the code lives, start with `Atlas`
- if you do not know where backend code lives, start with `Compass`
- if the change is mostly UI, use `Canvas`
- if the change touches cookies, refresh, auth guards, or `app/api`, use `Sentry`
- if the change touches booking slots, local dates, or timezone math, use `Chronos`
- if the change is a generic NestJS API change, use `Forge`
- if the change touches auth, verification, refresh tokens, or account lifecycle in the API, use `Sentinel`
- if the change touches workspace visibility, invitations, memberships, rooms, or ADMIN versus MEMBER permissions, use `Harbor`
- if the change touches backend booking validation or scheduling rules, use `Anchor`
- if the change touches Prisma schema, migrations, or database constraints, use `Bedrock`
- if the work is mainly about proving backend behavior with Jest or integration coverage, use `Verifier`
- if you want a backend risk review, use `Rampart`
- if the work is mainly about proving behavior with tests, use `Beacon`
- if you want a risk review, use `Aegis`
- if the implementation is done and docs may be stale, use `Ledger`
- if you are unsure how Next.js, React, Playwright, NestJS, Prisma, or OpenAI tooling behaves, use `Lumen`
- if the change is about the multi-agent setup itself, use `Steward`

## Boundaries

These agents are intentionally narrow.

Good practice:

- use one implementation owner for a change
- use read-only agents to map, verify, and review
- let schema work be owned by `Bedrock` when the database contract changes
- use `Ledger` after behavior settles
- use `Steward` for periodic maintenance of agent definitions and orchestration policy

Bad practice:

- asking multiple implementation agents to edit the same area at once
- using `Canvas` for auth proxy bugs that belong to `Sentry`
- using `Chronos` for generic UI cleanup unrelated to booking or time behavior
- using `Forge` for auth, booking-policy, or schema-heavy changes that have a more specific owner
- using `Bedrock` without also checking the affected domain logic and tests
- using `Steward` to make unrelated product changes
- using `Ledger` to write speculative requirements

## Notes

The current Codex configuration lives in `.codex/config.toml` and the custom agents live in `.codex/agents/`.
