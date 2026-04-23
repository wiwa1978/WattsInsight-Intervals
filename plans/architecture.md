# Architecture Blueprint

## System Type

Single-tenant SaaS platform split into a standalone Hono API plus two Next.js App Router clients: a user-facing web app and a dedicated admin console.

## Technology Stack

- Next.js App Router (canary), React 19, TypeScript 5.9
- Hono for the platform API in `apps/api`
- Tailwind CSS v4 + tokenized themes in `apps/web/src/app/globals.css` and `apps/admin/src/app/globals.css`
- PostgreSQL + Drizzle ORM via shared `@platform/platform-db`
- Better Auth + plugins (admin, 2FA, passkey, magic link)
- Dodo Payments (`@dodopayments/better-auth` + webhook handler)
- next-intl for localization and locale routing
- Zod for input and env validation

## Repository Topology

- `apps/api/src` Hono routes, auth wiring, webhook handlers, and domain services
- `apps/web/src` localized user-facing Next.js app
- `apps/admin/src` localized admin Next.js app
- `packages/auth-core` server-side auth module factory and middleware
- `packages/auth-shared` client-safe auth roles, additional fields, and shared types
- `packages/platform-db` shared Drizzle schema and DB access
- `packages/contracts` shared request/response contracts

## Route Architecture

User app (`apps/web/src/app`):

- `/(frontend)/(landing)`
- `/(frontend)/(auth)/login`
- `/(frontend)/(auth)/signup`
- `/(frontend)/(auth)/forgot-password`
- `/(frontend)/(auth)/reset-password`
- `/(backend)/dashboard`
- `/(backend)/billing`
- `/(backend)/settings`

Admin app (`apps/admin/src/app`):

- `/(frontend)/(landing)`
- `/(frontend)/(auth)/login`
- `/(frontend)/(auth)/signup`
- `/(frontend)/(auth)/forgot-password`
- `/(frontend)/(auth)/reset-password`
- `/(backend)/dashboard`
- `/(backend)/billing`
- `/(backend)/settings`
- `/(backend)/(admin)/admin/overview`
- `/(backend)/(admin)/admin/users`
- `/(backend)/(admin)/admin/users/[userId]`
- `/(backend)/(admin)/admin/billing`
- `/(backend)/(admin)/admin/discounts`
- `/(backend)/(admin)/admin/notifications`

API (`apps/api/src/app.ts`):

- `/auth/*`
- `/auth/mobile/*`
- `/me/*`
- `/admin/*`
- `/webhooks/dodo-payments`
- `/api/openapi.json`
- `/api/swagger`

## Security Boundaries

1. Edge proxy/middleware (`apps/web/src/proxy.ts`, `apps/admin/src/proxy.ts`)
   - handles locale middleware integration
   - performs fast cookie-presence checks for coarse redirects
2. API authorization (mandatory)
   - all privileged routes enforce server-side auth in `apps/api`
   - authenticated routes use `requireAuth`
   - admin routes layer `requireAdmin` and `requireAdminAccess`
   - admin allowlist enforcement is API-owned, not client-owned

Never trust client-only route state for authorization.

## Core Data Domains

### Auth Domain (`packages/platform-db/src/schema/auth.ts`)

- `user`, `session`, `account`, `verification`
- `two_factor`, `passkey`
- custom user profile fields and `role`

### Billing Domain (`packages/platform-db/src/schema/billing.ts`)

- `user_credits`: balance + cumulative totals
- `credit_transactions`: credit ledger (`purchase`, `usage`, `bonus`, `refund`, `admin_adjustment`)
- `credit_purchases`: purchase records with VAT breakdown and payment status
- `discounts`, `user_discounts`: discount catalog + assignments

### Notification Domain (`packages/platform-db/src/schema/notifications.ts`)

- `notification`: type/category, read-state, optional banner settings and metadata

## Core Runtime Flows

### Authentication Flow

1. Web/admin clients use Better Auth clients in `apps/web/src/lib/auth-client.ts` and `apps/admin/src/lib/auth-client.ts`
2. API validates browser sessions and exposes SSR-safe identity endpoints at `/me/session` and `/admin/session`
3. API issues native-client bearer tokens via `/auth/mobile/*`
4. Sessions persist to PostgreSQL and are cached via Better Auth cookie support

### Credit Purchase Flow

1. User initiates Dodo checkout from the web billing UI
2. The request goes through `POST /me/billing/checkout` in `apps/api/src/app.ts`
3. Dodo webhook calls `POST /webhooks/dodo-payments`
4. `createBillingService().processCreditPurchase(...)` updates purchase + ledger + balance atomically

### Admin Discount Flow

Canonical implementation spans:

- API domain service: `apps/api/src/modules/discounts/service.ts`
- Admin client service wrapper: `apps/admin/src/lib/services/discounts.ts`

Supported operations:

- code generation + uniqueness checks
- create/update/delete
- assign/remove users
- search users
- Dodo synchronization on relevant operations

## Application Layering

1. UI layer: `apps/web/src/app` + `apps/web/src/components`, `apps/admin/src/app` + `apps/admin/src/components`
2. Client integration layer: `apps/web/src/lib`, `apps/admin/src/lib`
3. API/domain layer: `apps/api/src/app.ts` + `apps/api/src/modules/*`
4. Shared platform layer: `packages/*`

Keep domain logic in API/services, not in page components.

## Decoupling Status

- `apps/web` and `apps/admin` do not own DB schemas, migrations, seeders, email pipelines, or Better Auth server instances
- API routes are the source of truth for auth, billing, notifications, discounts, and admin authorization
- browser clients remain cookie-based by design, but authorization decisions are not trusted from the client side

## Action Contract Standard

Actions should return discriminated unions with explicit `success` boolean and typed payloads. Avoid mixed success states (`success: true` with `error` string).

## Performance Guidelines

- parallelize independent DB queries (`Promise.all`)
- use SQL counts for totals, not list-then-count in app memory
- avoid heavy auth checks in middleware; enforce on API handlers and server layouts

## Reliability Guidelines

- validate all external payloads (webhooks, API callbacks)
- keep integrations failure-tolerant where business-safe (for example, external sync failures should not always block local persistence)
- avoid sensitive payload logging

## Environment and Configuration

Environment contracts are defined per app:

- API: `apps/api/src/env.ts`
- Web: `apps/web/src/env.ts`
- Admin: `apps/admin/src/env.ts`

Core variables:

- DB: `DATABASE_URL`
- API URLs: `APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`
- App URLs: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAIN_APP_URL`, `ADMIN_APP_URL`
- Auth providers: Google/GitHub optional credentials, `BETTER_AUTH_SECRET`, `JWT_SECRET`
- Admin access: `ADMIN_ALLOWLIST`
- Billing: `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_PAYMENTS_ENVIRONMENT`
- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Observability: `LOG_LEVEL`, `LOG_FILE_PATH`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`
