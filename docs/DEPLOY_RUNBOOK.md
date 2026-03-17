# Production Deploy Runbook

This runbook documents the current production deployment shape implemented in this repository:

- Cloudflare Registrar + Cloudflare DNS for the domain
- Vercel for [`apps/web`](../apps/web)
- Railway for [`apps/api`](../apps/api)
- Neon Postgres for the database
- Resend for transactional email

## Branch Deployment Strategy

Use branch-based environments with a strict separation between production and staging:

- `main` is the only production branch.
- `develop` is the shared integration branch for staging and preview validation.
- Feature branches should merge into `develop` first, then `develop` should be promoted into `main`.
- Production domains and production data must stay attached to `main` only.
- Staging and preview deployments must use separate hosts, secrets, and databases.

Current provider behavior should follow this rule set:

- Vercel production deployments must continue to use `main`.
- Vercel preview deployments should validate changes from `develop` and other non-production branches.
- Railway production must continue to run from `main`.
- Railway staging must be a separate service or environment connected to `develop`.

Do not repoint the existing Railway production service from `main` to `develop`. That would move the live API at `api.openspaceapp.io` onto the development branch.

## Current Production Topology

- `apps/web` is the public frontend and should be the primary website.
- `apps/web` proxies browser requests to the backend through Next.js route handlers.
- `apps/api` is a separate NestJS service exposed under `/api/*`.
- Auth cookies are set by the web app, not by the API service.
- The API does not currently enable CORS in bootstrap; this is acceptable because browser traffic is expected to stay on the web origin and use the web proxy routes.

## Recommended Hostnames

The production domain is `openspaceapp.io`:

- `openspaceapp.io`: primary web application on Vercel
- `www.openspaceapp.io`: alias to the primary web application
- `api.openspaceapp.io`: public API origin on Railway
- `openspaceapp.io`: Resend verified sending domain for transactional email

Recommended staging hostnames for `develop`:

- `develop.openspaceapp.io`: optional stable Vercel branch domain for the web preview
- `api-develop.openspaceapp.io`: optional stable Railway staging host for the API
## Required Environment Variables

### Web (`apps/web` on Vercel)

The current web app requires one deployment-specific variable:

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `OPENSPACE_API_BASE_URL` | yes | `https://api.openspaceapp.io` | Used by server-side proxy routes in `apps/web/lib/backend-api.ts`. No `NEXT_PUBLIC_*` variables are currently required for production. |

Recommended values by environment:

- production on `main`: `OPENSPACE_API_BASE_URL=https://api.openspaceapp.io`
- preview or staging from `develop`: `OPENSPACE_API_BASE_URL=https://<staging-api-host>`

Preview web deployments must not call the production API origin.

### API (`apps/api` on Railway)

The API validates environment variables in `apps/api/src/config/env.validation.ts`.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | `production` | In production, the API defaults email delivery to Resend if `EMAIL_PROVIDER` is not set. |
| `DATABASE_URL` | yes | `postgresql://...` | Prisma uses this single variable for both runtime and `prisma migrate deploy`. |
| `WEB_BASE_URL` | yes in production with Resend | `https://openspaceapp.io` | Used to build clickable email verification and password reset links that point back to the web app. |
| `JWT_ACCESS_SECRET` | yes | generated secret | Must be at least 16 characters. |
| `JWT_REFRESH_SECRET` | yes | generated secret | Must be at least 16 characters. |
| `EMAIL_PROVIDER` | recommended | `resend` | Not strictly required in production because the validator defaults to `resend`, but setting it explicitly is safer. |
| `RESEND_API_KEY` | yes in production with Resend | `re_...` | Required when `EMAIL_PROVIDER=resend`, which is the effective production path. |
| `RESEND_FROM_EMAIL` | yes in production with Resend | `noreply@openspaceapp.io` | Must belong to a verified Resend sending domain. |
| `RESEND_FROM_NAME` | recommended | `OpenSpace` | Defaults to `OpenSpace` if omitted. |

Current optional API overrides already implemented in code:

- `JWT_ACCESS_TTL` default `15m`
- `JWT_REFRESH_TTL` default `7d`
- `API_PORT` default `3001`
- `WEB_BASE_URL` is only required when the API sends Resend emails
- `EMAIL_VERIFICATION_TTL_MINUTES` default `60`
- `PASSWORD_RESET_TTL_MINUTES` default `60`
- `TRUSTED_PROXY_IPS` default empty in production
- backend policy limit variables such as `MAX_WORKSPACES_PER_USER`, `MAX_BOOKING_DAYS_AHEAD`, and the other `MAX_*` or `RATE_LIMIT_*` settings

Staging API guidance:

- use a separate staging database, never the production database
- use separate JWT secrets from production
- use a non-production host such as a Railway-generated domain or a dedicated staging subdomain
- prefer `NODE_ENV=production` if you want staging behavior to match production validation and cookie/security behavior as closely as possible

## Monorepo Build, Start, and Migration Commands

Run these from the repository root unless the platform is configured with an app-specific root directory.

### Install and verification

```bash
pnpm install --frozen-lockfile
pnpm --filter @openspace/api prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Database migration

```bash
pnpm --filter @openspace/api prisma:migrate:deploy
```

### Service build and start

Web:

```bash
pnpm --filter @openspace/web build
pnpm --filter @openspace/web start
```

API:

```bash
pnpm --filter @openspace/api build
pnpm --filter @openspace/api start:prod
```

Operational notes:

- Railway normally injects `PORT`; the API will listen on `PORT` first and only fall back to `API_PORT` if `PORT` is absent.
- Vercel manages the web runtime itself; `pnpm --filter @openspace/web start` is useful for parity checks outside Vercel, not as a Vercel runtime command.

## Provider Setup

### 1. Cloudflare

- Keep the domain registered in Cloudflare Registrar.
- Manage authoritative DNS in Cloudflare DNS.
- Create the production DNS records only after the Vercel, Railway, and Resend projects have been created and each provider has issued its required verification or target records.

### 2. Vercel

- Create a Vercel project for the monorepo web app.
- Point the project at `apps/web`.
- Keep the Vercel production branch set to `main`.
- Set the production value `OPENSPACE_API_BASE_URL=https://api.openspaceapp.io`.
- Set the preview value `OPENSPACE_API_BASE_URL=https://<staging-api-host>`.
- Let `develop` deploy as a Vercel Preview branch. If desired, assign a branch domain such as `develop.openspaceapp.io` to that branch.
- Attach both `openspaceapp.io` and `www.openspaceapp.io` to the project.
- Apply the exact DNS records requested by Vercel in Cloudflare.

Minimal `develop` setup on Vercel:

- confirm `main` remains the Production Branch in project Git settings
- create or update `OPENSPACE_API_BASE_URL` in Environment Variables
- scope `https://api.openspaceapp.io` to `Production`
- scope `https://<staging-api-host>` to `Preview`
- push a commit to `develop` and verify the preview deployment talks to the staging API
- optionally assign `develop.openspaceapp.io` to the `develop` branch for a fixed preview URL

### 3. Railway

- Keep the current production Railway service connected to `main`.
- Create a second Railway service for staging from the same repository.
- Point both services at `apps/api`.
- Set the staging service source branch to `develop`.
- Set the API environment variables listed above in both services, but use separate secrets and a separate database for staging.
- Set `WEB_BASE_URL` to the matching web origin in each environment, for example `https://openspaceapp.io` in production and the preview or staging web host outside production.
- Expose production on `api.openspaceapp.io`.
- Expose staging on a non-production host such as a Railway-generated domain or a dedicated staging subdomain.
- Apply the exact DNS records requested by Railway in Cloudflare.
- Use `GET /api/health` as the basic health endpoint.

### 4. Neon

- Create a Neon Postgres database.
- Use a `DATABASE_URL` that works for both Prisma Client and `prisma migrate deploy`.
- The current Prisma schema does not define a separate `directUrl`, so runtime and migrations both use the same `DATABASE_URL`.
- The database must allow the migration SQL in `apps/api/prisma/migrations/0001_init/migration.sql`, including `pgcrypto`, `btree_gist`, `tstzrange`, and exclusion constraints.

Recommended staging setup for `develop`:

- keep production on the primary branch or project already in use
- create a persistent Neon branch for `develop`, or a separate staging project if you want stronger isolation
- use the staging branch connection string only in the Railway staging service

### 5. Resend

- Verify the sending domain `openspaceapp.io`.
- Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Railway after domain verification is complete.
- Resend DNS verification records must be added manually in Cloudflare.

## Manual Steps Outside the Repository

The repository does not currently include deployment infrastructure as code for Vercel, Railway, Neon, or Resend. These steps remain manual:

- creating the Vercel project
- creating the Railway service
- creating any staging branch domains or staging service hosts
- creating the Neon database
- creating a separate staging database when `develop` is deployed outside local development
- verifying the Resend sending domain
- adding provider-generated DNS records in Cloudflare
- storing and rotating production secrets in each provider UI
- storing and rotating separate staging secrets in each provider UI
- deciding how and when `prisma migrate deploy` runs during Railway deployments

Current application assumptions and gaps that matter in production:

- The API trusts forwarded client IPs only when `TRUSTED_PROXY_IPS` explicitly matches the immediate proxy IP. This repository does not manage provider proxy IP ranges.
- The web proxy does not currently forward the original browser IP to the API, so API-side IP-based limits will reflect the upstream web runtime path rather than a guaranteed end-user IP.
- There is no deployment manifest in the repo for Vercel or Railway, so build/start/migration wiring lives in provider configuration.
- There is no production seed or bootstrap script in the repo; the first production user and workspace setup happen through the implemented UI and API flows.
