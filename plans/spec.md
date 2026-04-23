# Functional Specification

## Goal

Define all functional behavior required to rebuild this SaaS system end-to-end.

## 1) Authentication and Account Management

### Architecture Rule

- `apps/api` is the only authentication authority
- browser clients use Better Auth against API-hosted `/auth/*`
- native clients use bearer tokens from `/auth/mobile/*`
- clients never instantiate Better Auth server runtime or access the database directly

### Supported Sign-In Methods

- email/password
- OAuth: Google, GitHub
- magic link
- passkeys
- optional two-factor authentication

### Required Behaviors

- signup and login flows work for all enabled methods
- email verification flow supported
- password reset flow supported
- active sessions list and revoke support
- optional account deletion and change-email/password
- linked account management where configured

### Authorization Rules

- role model: `user` and `admin`
- admin-only actions always enforced server-side
- admin allowlist enforcement lives in `apps/api`
- non-admin users cannot read or mutate admin resources

## 2) User Application Area

### Dashboard

- render summary cards and recent activity
- include notifications access and user context

### Billing

- show current credit balance and usage context
- show pricing/packages and purchase flow entry points
- show transaction history and purchase history

### Settings

- profile editing (name, locale, optional address fields)
- auth/security settings (password, 2FA, passkeys, sessions, linked accounts)

## 3) Credit System

### Data Semantics

- credits are tracked with a balance table plus immutable ledger entries
- each credit-impacting operation writes `credit_transactions`
- purchase metadata persists in `credit_purchases`

### Transaction Types

- `purchase`
- `usage`
- `bonus`
- `refund`
- `admin_adjustment`

### Invariants

- balance after transaction must remain internally consistent
- usage transactions are negative amounts
- purchase/bonus generally positive
- references (`referenceType`, `referenceId`) should be set when available

## 4) Dodo Payments and Webhooks

### Checkout/Payments

- user can initiate checkout for configured packages
- completed payment credits user account

### Webhooks

- webhook payloads validated before processing
- at minimum handle payment success/failure events
- on success:
  - resolve user by customer identity
  - resolve purchased package
  - create purchase record
  - post ledger entries
  - update user credit balance

### Failure Handling

- malformed payload: reject/log safely
- unknown package/user: log safely and fail processing
- do not log sensitive full payloads in production-like paths

## 5) Discount Management (Admin)

Canonical modules:

- API: `apps/api/src/modules/discounts/service.ts`
- Admin client: `apps/admin/src/lib/services/discounts.ts`

### Required Operations

- generate discount code
- validate code uniqueness
- create discount
- update discount
- delete discount
- list discounts with filters/pagination
- assign/remove users to discount
- search users for assignment UI

### Discount Rules

- end date must be after start date
- code must be unique
- status derived from date window and explicit state where relevant
- max usage constraints enforced

### External Sync

- sync create/update/delete with Dodo discount API when mapping exists
- external sync failures should surface actionable errors when blocking, or be logged if non-blocking by design

## 6) Admin Area

### Overview

- user stats and growth indicators
- revenue and credit consumption summaries
- chart visualizations by time range

### Users

- paginated/searchable listing
- user detail page with profile, credit summary, transactions, purchases
- ban/unban and impersonation capabilities (where configured)

### Billing Analytics

- global purchase and transaction tables
- revenue chart, transaction chart, credits-consumed chart

### Notifications

- create and send notifications
- support category/type
- optional banner display + expiration
- history visibility

## 7) Notifications Domain

### Required Behaviors

- unread count retrieval
- mark-as-read and bulk read where available
- topbar notification list updates after actions
- banners only shown when configured and not expired

## 8) Internationalization

- route-level locale prefix with next-intl navigation
- all UI strings localized
- no hardcoded user-facing text in page-level features unless intentionally fallback-only

## 9) Action Response Contract

### Rule

Actions should return discriminated unions:

- success branch with typed data
- failure branch with explicit `error`

### Example

```ts
type ActionResult<T> = { success: true; data: T } | { success: false; error: string };
```

Use this consistently to avoid ambiguous client-side branching.

## 10) Multi-Client Boundary

- `apps/web` and `apps/admin` are UI clients only
- all business logic, DB access, email sending, payment provider integration, and admin authorization live in `apps/api`
- SSR in Next.js clients may call API-owned session endpoints (`/me/session`, `/admin/session`) but must not bypass API authorization
- future iPhone/Android clients should be able to consume the same auth and domain APIs without importing Next.js code

## 11) Type Safety and Validation

- no `any` in core flows
- Zod validation for all external/unsafe input boundaries
- typed helper functions for shared behavior
- typed chart payload/tooltips where chart libs default to unknown/any

## 12) Acceptance Criteria (End-to-End)

1. user can sign up, verify email (if enabled), login, and reach dashboard
2. user can purchase credits and see updated balance/history after webhook processing
3. admin can access admin pages; non-admin cannot
4. admin can manage discounts and assign/remove users
5. admin can send notifications and users can read them in topbar
6. billing and analytics pages render tables/charts with valid data
7. project passes lint and typecheck

## 13) Validation Commands

- `bunx tsc --noEmit`
- `bunx eslint .`
