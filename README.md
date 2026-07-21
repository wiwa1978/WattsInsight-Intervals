# WattsInsights Platform Monorepo

Single-tenant SaaS platform split into three deployable applications:

- `apps/api`: Hono API and backend authority
- `apps/web`: user-facing Next.js client
- `apps/admin`: admin Next.js client

The main architectural goal is separation of concerns. The API owns privileged behavior, persistence, auth server runtime, payments, email, and admin authorization. Web and admin are replaceable API consumers that own UI, routing, and browser interaction only.

## Current Status

- Runtime split is in place: API, web, and admin are separate apps.
- Web and admin no longer own database access, Better Auth server instances, email pipelines, or payment-provider access.
- Admin authorization, allowlist checks, TOTP bootstrap rules, and privileged mutations are enforced by the API.
- Billing supports configurable `BILLING_MODE` values: `credits` or `subscriptions`.
- Credit liability tracking, entitlement checks, server-owned credit usage, and admin billing visibility are implemented.
- Profile/settings UX includes billing-address labeling, preferences, linked accounts, and active sessions.
- Country seed data is available through `bun run db:seed`.
- Azure deployment scaffolding is present for ACR, Azure Container Apps, Log Analytics, and external PostgreSQL.
- Last local verification during this update: `bun run test:ci` passed.

## Applications

### `apps/api`

Hono API on port `8787`. Owns:

- Better Auth server runtime and `/auth/*` routes
- browser session validation and native JWT token flows
- PostgreSQL access through `packages/platform-db`
- billing, credits, subscriptions, discounts, notifications, and admin services
- Dodo Payments checkout, webhook, and reconciliation flows
- email sending through `packages/email-core`
- OpenAPI, API docs, logs, and operational job routes

### `apps/web`

Next.js user-facing client on port `3100`. Owns:

- localized public/authenticated user pages
- Better Auth browser client configuration
- SSR and client calls to API-owned session/data endpoints
- user billing, dashboard, and settings UI

### `apps/admin`

Next.js admin client on port `3101`. Owns:

- localized admin dashboards and workflows
- Better Auth browser client configuration
- SSR and client calls to API-owned admin endpoints
- presentation for users, admins, billing, discounts, logs, operations, vouchers, webhooks, and system settings

## Packages

```txt
packages/
  auth-client/        # Browser auth client helpers
  auth-core/          # Server-side auth runtime and middleware
  auth-shared/        # Client-safe shared auth fields, roles, and types
  contracts/          # Shared API contracts and route types
  email-core/         # API-side email abstractions
  frontend-shared/    # Shared frontend components/helpers
  payments-core/      # API-side payment abstractions
  platform-db/        # Drizzle schema, migrations, seed data, and DB access
```

## Development

Install dependencies:

```bash
bun install
```

Run individual apps:

```bash
bun run dev:api
bun run dev:web
bun run dev:admin
```

Run the full local stack with prewarm:

```bash
bun run dev:all
```

Common quality checks:

```bash
bun run test:ci
bun run typecheck:all
bun run test:api
bun run test:web
bun run test:admin
bun run test:packages
```

## Environment

Use these templates:

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/admin/.env.example`

### API Runtime

Required core values:

- `DATABASE_URL`
- `APP_URL`
- `API_URL`
- `ADMIN_APP_URL`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ALLOWLIST`

Billing and jobs:

- `BILLING_MODE`: `credits` or `subscriptions`, defaults to `credits`
- `PAYMENT_PROVIDER`: defaults to `dodo`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `DODO_PAYMENTS_ENVIRONMENT`: `test_mode` or `live_mode`
- `BILLING_RECONCILIATION_SECRET`: bearer token for `GET /billing/reconcile`
- `JOBS_SECRET_KEY`: bearer token for `POST /jobs/run`

Optional OAuth values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Email:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Web Runtime

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ADMIN_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`

### Admin Runtime

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_MAIN_APP_URL`

## Database

The Drizzle schema lives in `packages/platform-db/src/schema`, and migrations live in `packages/platform-db/drizzle`.

Common commands:

```bash
bun run db:generate -- --name describe_change
bun run db:check
DATABASE_URL=postgres://user:password@host:5432/database bun run db:migrate
bun run db:seed
```

`bun run db:seed` currently seeds country data used by profile/billing-address UI.

## API Documentation

The API serves its own documentation:

- OpenAPI JSON: `/openapi.json` and `/api/openapi.json`
- Swagger UI: `/api/swagger`
- Scalar docs: `/api/docs`

API versioning policy:

- current runtime routes remain unversioned while contract hardening continues
- `/api/v1` is reserved as the canonical stable prefix for generated SDKs and native clients
- unversioned routes should become temporary compatibility aliases once `/api/v1` is mounted

## Azure Deployment

Deployment files are included for GitHub Actions and Azure:

- `.github/workflows/test.yml`: CI on PRs and pushes to `main`
- `.github/workflows/deploy-production-infra.yml`: manual Azure infra/bootstrap deployment
- `.github/workflows/deploy-production.yml`: production app deployment after successful CI, or manual bypass with confirmation
- `infra/main.bicep` and `infra/main.resources.bicep`: Azure resources
- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/admin/Dockerfile`: app images

The Azure topology is:

- one Azure Container Registry
- one Azure Container Apps Environment
- one Log Analytics workspace
- three separate Azure Container Apps:
  - API: `${APP_NAME}-api`, port `8787`
  - web: `${APP_NAME}-web`, port `3100`
  - admin: `${APP_NAME}-admin`, port `3101`
- external PostgreSQL, managed outside this Bicep stack

Default deployment values:

- `AZURE_LOCATION`: `swedencentral`
- `AZURE_RESOURCE_GROUP_NAME`: `RG-WattsInsight-Intervals`
- `AZURE_ENVIRONMENT_NAME`: `production`
- `APP_NAME`: `WattsInsights`
- `NEXT_PUBLIC_APP_NAME`: `WattsInsights`
- `NEXT_PUBLIC_ADMIN_APP_NAME`: `WattsInsights Admin`
- `BILLING_MODE`: `credits`

### GitHub Repository Variables

Required:

- `POSTGRES_SERVER_FQDN`
- `POSTGRES_ADMIN_LOGIN`
- `POSTGRES_DATABASE_NAME`

Optional overrides:

- `AZURE_LOCATION`
- `AZURE_RESOURCE_GROUP_NAME`
- `AZURE_ENVIRONMENT_NAME`
- `APP_NAME`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_ADMIN_APP_NAME`
- `BILLING_MODE`
- `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME`

### GitHub Repository Secrets

Azure login:

- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`

Database and runtime:

- `POSTGRES_ADMIN_PASSWORD`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ALLOWLIST`
- `BILLING_RECONCILIATION_SECRET`
- `JOBS_SECRET_KEY`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_GITHUB_CLIENT_ID`
- `OAUTH_GITHUB_CLIENT_SECRET`

GitHub does not allow repository secret names starting with `GITHUB_`. The workflows therefore use `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET` as GitHub secret names, then map them into the API container as runtime `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### Deployment Flow

1. Configure the repository variables and secrets above.
2. Run `Azure Production Infra` manually from GitHub Actions to create or update Azure resources and deploy initial images.
3. Push to `main`; `CI` runs `bun run test:ci` and uploads deployment-scope metadata.
4. `Azure App Deploy to Production` builds changed app images, pushes them to ACR, runs migrations when needed, updates the Container Apps, waits for revisions, and checks API health.

The infra workflow only uses placeholder images for first-time bootstrap. If all three Container Apps already exist, it resolves existing resources and avoids replacing production apps with placeholders.

## Logging and Observability

- API logs default to stdout in production for platform collection.
- Local file logging is available through `LOG_FILE_PATH`.
- Browser logs are forwarded to the API via `POST /logs/client`.
- Azure deployment sends Container App logs to Log Analytics.

## Security Notes

- Never commit real secrets.
- Keep `.env` files local or managed by deployment secrets.
- Rotate secrets immediately if exposed.
- Raw Better Auth admin mutations are blocked except explicitly allowed API routes.
- Production secrets must be non-placeholder values with sufficient length where enforced by `apps/api/src/env.ts`.
