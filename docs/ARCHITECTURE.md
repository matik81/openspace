# Architecture Overview

OpenSpace uses a modular monolith architecture inside a `pnpm` workspace monorepo.

## Repository Layout

```text
apps/
  api
  web
packages/
  shared
infra/
  docker
```

## Backend

The backend is a NestJS application with Prisma as the data layer.

Main areas:

- auth
- workspaces
- rooms
- bookings
- health
- config
- prisma
- common

Notes:

- Invitation flows are implemented inside the workspace domain rather than as a standalone NestJS module.
- Rate-limit tracking and suspensions are persisted in PostgreSQL.
- Refresh tokens are hashed and stored on the `User` record.
- Account deletion is logical and cascades domain-side logical cancellations where required.

## Database

Database: PostgreSQL

Key design decisions:

- Multi-workspace data isolation through explicit `workspaceId` relations
- UUID primary keys
- Booking timestamps stored as `timestamptz`
- Database-level active-only overlap protection using PostgreSQL exclusion constraints
- Partial unique indexes for workspace names and room names among active entities only
- Logical cancellation through status fields and cancellation timestamps
- Persisted workspace schedule history through `WorkspaceScheduleVersion`
- Persisted email verification tokens and password reset tokens
- Persisted rate-limit operation logs and suspensions

Current status model:

- users: `ACTIVE | CANCELLED`
- workspaces: `ACTIVE | CANCELLED`
- rooms: `ACTIVE | CANCELLED`
- bookings: `ACTIVE | CANCELLED`

## Booking Validation Model

Booking validation is applied in this order:

1. `endAt` must be after `startAt`
2. booking must stay within a single local day in the workspace timezone
3. booking date must not be in the past
4. booking date must not exceed the future booking horizon
5. booking must stay within workspace schedule hours
6. booking must align to 15-minute increments
7. booking must not overlap with another active booking for the same room
8. booking must not overlap with another active booking by the same user in the same workspace

## Frontend

The frontend is a Next.js App Router application.

Primary routes:

- `/`
- `/login`
- `/register`
- `/verify-email`
- `/dashboard`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/admin`

Server-side web proxy routes under `apps/web/app/api` forward browser requests to the backend API. They also manage auth cookies and refresh flow.

Current auth/session lifecycle:

- login stores access and refresh tokens in HTTP-only cookies
- authenticated web proxy routes retry once on `401` after calling `/api/auth/refresh`
- logout calls backend `/api/auth/logout` and then clears cookies locally

## Infrastructure

Local development infrastructure is defined in `infra/docker/docker-compose.yml`.

Provided services:

- PostgreSQL

Current usage:

- PostgreSQL is required and used by the application

## API Surface and Documentation

The API is consumed by the web app and is suitable for other clients.

Current note:

- Swagger/OpenAPI is not enabled in the NestJS bootstrap and no generated API spec is currently exposed.
- Any future external-client documentation should be generated from the implemented controllers rather than described aspirationally.

## Internationalization

The frontend codebase is structured cleanly enough to support future internationalization, but no i18n framework is currently configured.
