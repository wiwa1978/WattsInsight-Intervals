# SaaS Platform Monorepo

This repository is a multi-client SaaS platform split into three main applications:

- `apps/api`: the platform API and the only backend authority
- `apps/web`: the user-facing web client
- `apps/admin`: the admin web client

The main architectural goal is decoupling: the clients should behave like replaceable consumers of the API, and future native clients should be able to use the same backend without inheriting Next.js-specific or browser-only server logic.

## What the Codebase Does

The platform provides:

- authentication and account management
- credit-based billing and purchase history
- Dodo Payments checkout and webhook processing
- admin dashboards, user management, discount management, and notifications
- localized web and admin frontends

The API owns all privileged behavior. The web and admin apps own UI, routing, and client-side interaction only.

## Architecture

### `apps/api`

Hono-based API that owns:

- Better Auth server runtime
- browser session validation
- native token issuance and refresh
- PostgreSQL access through shared DB packages
- billing, discounts, notifications, and admin services
- webhook handling
- observability and server logging

### `apps/web`

Next.js user-facing client that owns:

- marketing pages and authenticated user pages
- Better Auth browser client configuration
- SSR calls to API-owned session endpoints
- UI state, data fetching, and presentation

It does not own database access, email sending, payment-provider access, or server-side auth logic.

### `apps/admin`

Next.js admin client that owns:

- admin dashboards and privileged admin UI
- Better Auth browser client configuration
- SSR calls to API-owned admin session endpoint
- presentation for admin workflows backed by API routes

It does not own admin allowlist enforcement, database access, email, or direct business logic.

### `packages/*`

Shared platform modules, including:

- `auth-core`
- `auth-shared`
- `platform-db`
- `payments-core`
- `email-core`
- `contracts`

## Repository Layout

```txt
apps/
  api/                # Hono API and backend authority
  web/                # User-facing Next.js client
  admin/              # Admin Next.js client

packages/
  auth-core/          # Server-side auth runtime and middleware
  auth-shared/        # Safe shared auth fields, roles, and types
  email-core/         # Email abstractions for API-side use
  payments-core/      # Payment abstractions for API-side use
  platform-db/        # Shared schema and DB access used by API
  contracts/          # Shared API contracts
```

## Auth Model

There are two supported auth styles:

1. Browser clients
   - `apps/web` and `apps/admin` use Better Auth client libraries against API-hosted `/auth/*`
   - SSR identity reads use API-owned endpoints such as `/me/session` and `/admin/session`

2. Native or non-browser clients
   - use bearer tokens from `/auth/mobile/token`
   - refresh with `/auth/mobile/refresh`
   - revoke with `/auth/mobile/revoke`

Admin role and allowlist enforcement are handled only in `apps/api`.

The auth packages are intentionally split:

- `@platform/auth-core` is for server/runtime auth concerns only
- `@platform/auth-shared` contains client-safe shared auth metadata such as roles and additional user fields

## Why the Split Matters

This repo was migrated away from a monolithic Next.js design. The intended end state is:

- only `apps/api` talks to the database
- only `apps/api` runs Better Auth server logic
- only `apps/api` sends emails and talks to payment providers
- `apps/web`, `apps/admin`, and future mobile apps all consume the same API contracts

## Development

Install dependencies at the repo root:

```bash
bun install
```

Run one app:

```bash
bun run dev:api
bun run dev:web
bun run dev:admin
```

Run all three:

```bash
bun run dev:all
```

## Environment

Use these templates:

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/admin/.env.example`

### API

Typical required values:

- `DATABASE_URL`
- `APP_URL`
- `API_URL`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_ALLOWLIST`
- `ADMIN_APP_URL`

Optional integrations include billing, email, and observability values.

## Database Migrations

The Drizzle schema lives in `packages/platform-db/src/schema`, and generated migrations live in `packages/platform-db/drizzle`.

Common commands from the repo root:

```bash
bun run db:generate -- --name describe_change
bun run db:check
DATABASE_URL=postgres://user:password@host:5432/database bun run db:migrate
```

Any PR that adds or changes DB-backed runtime behavior must include the corresponding generated migration. See `packages/platform-db/README.md` for the full workflow.

### Web

Typical required public values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`

Optional:

- `NEXT_PUBLIC_SENTRY_DSN`

### Admin

Typical required public values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_MAIN_APP_URL`
- `NEXT_PUBLIC_API_URL`

Optional:

- `NEXT_PUBLIC_SENTRY_DSN`

## API Documentation

The API serves its own documentation:

- OpenAPI JSON: `/openapi.json` and `/api/openapi.json`
- Swagger UI: `/api/swagger`
- Scalar docs: `/api/docs`

API versioning policy:

- current runtime routes remain unversioned while contract hardening continues
- `/api/v1` is reserved as the canonical stable prefix for generated SDKs and
  native clients
- unversioned routes should become temporary compatibility aliases once `/api/v1`
  is mounted

## Logging and Observability

- API logs can be written to a shared file via `LOG_FILE_PATH`
- browser logs are forwarded to the API via `POST /logs/client`
- Sentry is configured separately for API and Next.js clients

## Quality Checks

From the repo root:

```bash
bun run typecheck:api
bun run typecheck:web
bun run typecheck:admin
```

Per-app tests are also available:

```bash
bun run test:api
bun run test:web
bun run test:admin
```

## Current State

The codebase has been substantially decoupled already:

- web/admin no longer own DB layers
- web/admin no longer own Better Auth server instances
- web/admin no longer own email pipelines or seeders
- admin authorization is enforced by the API

The remaining client-specific coupling is intentional browser behavior, such as cookie-based auth UX in the web apps.

## Security Notes

- never commit real secrets
- keep `.env` files local or managed by deployment secrets
- rotate secrets immediately if exposed
