# Training App — Technical Requirements & Architecture Spec

**Status:** Draft v2 — focus is getting the foundation (auth, Intervals.icu connection, sync, calendar) solid before layering on anything else.
**Reference / inspiration:** https://lecoach.app/ (AI cycling/running coach built on top of Intervals.icu). Features like analytics dashboards, AI coaching and training plan generation are on the roadmap (see Section 4) but come after the foundation, not as part of it.

---

## 1. Product Summary

A web application where a user can:
1. Create an account (email/password).
2. Connect their **Intervals.icu** account via OAuth.
3. See a **calendar view** of all their activities, pulled from Intervals.icu.

The system must be built **API-first**, because a Postgres database and backend API will later be shared by:
- The authenticated web app (this MVP)
- A future iPhone app
- A future Android app

The marketing site (public, unauthenticated) is a separate concern from the authenticated app.

---

## 2. Phase 0 — Foundation (build this now)

This is "the basis" — get this right before touching anything else.

- [ ] User signup / login / logout via **BetterAuth** (email + password)
- [ ] "Connect Intervals.icu" flow via OAuth 2.0
- [ ] "Disconnect Intervals.icu" (revoke access)
- [ ] Background/on-demand sync of the user's activities from Intervals.icu into our own Postgres DB
- [ ] Calendar view (month view, navigable) showing activity name, sport type, duration, distance per day
- [ ] Public marketing site with a homepage and a signup CTA

Note: the calendar view itself is in scope for Phase 0; clicking into an activity is **not** — that's Phase 1 below. A day cell can be visually "there" without being interactive yet.

## 3. Phase 1 — Immediately next

- [ ] Clicking an activity opens a detail view (fields already captured in the `activities` table — see Data Model)

## 4. Roadmap — planned, but only after Phase 0/1 are solid

These are confirmed as wanted, not speculative — but they build on top of the foundation, so sequencing matters. Don't start any of these until Phase 0 is stable.

- **Analytics dashboard** (CTL/ATL/TSS, power/pace curves, trends) — will likely need additional computed fields or a training-load calculation job on top of the `activities` data already being synced.
- **AI coaching** (chat, ride/run analysis, recommendations) — will consume the same `activities.raw_payload` data plus likely wellness data; probably needs an `ACTIVITY:READ` + `WELLNESS:READ` scope upgrade at that point.
- **Training plan generation** — this is the one with the biggest architectural implication: generating and pushing planned workouts *back* to Intervals.icu means requesting `ACTIVITY:WRITE` (or `WORKOUT:WRITE`) scope and building the events/bulk-upload integration. You've already done exploratory work against the `/api/v1/athlete/{id}/events/bulk` endpoint for this — that work is directly reusable here later.
- **Multiple provider connections** - while phase 0 focuses only on Intervals.icu, we will later on also add Garmin Connect, Zwift, Withings, Strava

OAuth scopes should stay minimal now (see Section 9.3) and get extended via re-consent when these phases start — no need to over-scope today.

## 5. True Non-Goals (not currently planned at all)

- Pushing workouts to Garmin/Wahoo/Zwift directly (Intervals.icu already relays to these — no need to integrate with them ourselves for the moment)
- Wellness/weight/habit tracking as standalone features (distinct from what AI coaching may read)
- Multi-athlete / coach-athlete features
- Billing / subscriptions
- Building the native iOS/Android apps themselves (the API should be *ready* for them, per Section 6/System Architecture, but building them is not part of this spec)

Keep the code structured so the Roadmap items can be added later without a rewrite, but don't build them speculatively now.

---

## 6. System Architecture

```
                        ┌─────────────────────┐
                        │   Marketing Site     │  (public, unauthenticated)
                        │   Next.js / Astro     │
                        └─────────────────────┘

┌────────────┐   HTTPS/JSON   ┌──────────────────┐        ┌──────────────┐
│  Web App    │ ─────────────▶ │   Backend API     │ ─────▶ │   Postgres    │
│ (React SPA) │                │  (REST, /api/v1)  │        │  (single DB)  │
└────────────┘                 └──────────────────┘        └──────────────┘
                                        ▲
                (future)                │  same API, same auth model
┌────────────┐                          │
│  iOS App    │ ─────────────────────────┤
└────────────┘                          │
┌────────────┐                          │
│ Android App │ ─────────────────────────┘
└────────────┘
```

**Key architectural rule:** the Postgres database is only ever accessed by the backend API. Web, iOS and Android are all just *clients* of the same versioned REST API — none of them talk to the database directly, and none of them talk to Intervals.icu directly (all Intervals.icu calls, including OAuth token exchange, happen server-side so tokens/secrets never reach a client device).

Auth is handled by **BetterAuth**, with its **Bearer plugin** enabled. That gives cookie-based sessions for the web app "for free" while also issuing a bearer token (`Authorization: Bearer <token>`) that future iOS/Android clients can store and send on every request — so we get one auth system that works for both, rather than hand-rolling JWT issuance/refresh ourselves.

---

## 7. Recommended Tech Stack

Not prescriptive — swap freely if your coding agent/you prefer something else. This is a sensible default that keeps everything in one language and keeps the API mobile-ready from day one.

| Layer | Recommendation |
|---|---|
| Backend API | Node.js + TypeScript, Fastify (or NestJS), REST, versioned at `/api/v1` |
| ORM / migrations | Prisma or Drizzle |
| Database | PostgreSQL (Supabase / Neon / RDS / self-hosted — single instance) |
| Auth | **BetterAuth** — email/password, `bearer` plugin enabled for mobile-friendly token auth, sessions stored in Postgres. Adapter choice (Kysely direct vs. Prisma/Drizzle) should match whatever ORM the rest of the API uses. |
| Web app (authenticated) | React (Vite) or Next.js, calling the REST API only — no server-side DB access from this app |
| Marketing site | Next.js or Astro, statically generated, deployed independently |
| Styling | **Tailwind CSS + ShadCN-style component primitives** for frontend surfaces, using a shared monorepo Tailwind preset for design tokens used by both the authenticated web app and marketing site |
| Background sync jobs | A simple queue/cron worker (e.g. BullMQ + Redis, or a scheduled job) for periodic activity re-sync |
| Repo layout | Monorepo (Turborepo or Nx): `apps/api`, `apps/web`, `apps/marketing`, `packages/shared-types`, `packages/tailwind-config` |

---

## 8. Data Model (Postgres)

**Auth tables are defined by BetterAuth and checked into our Drizzle schema/migrations** so the database can be rebuilt from one migration set. The BetterAuth-owned tables are `user`, `session`, `account` and `verification`. Reach for BetterAuth's `additionalFields` config if you need extra columns on `user` (e.g. `timezone`) rather than adding ad-hoc columns.

Our own tables just reference BetterAuth's `user.id`:

```
connections
──────────────────────────────────────
id                uuid PK
user_id           uuid FK -> user.id
provider          text NOT NULL                 -- e.g. intervals_icu, strava, garmin, withings
provider_account_id text NOT NULL              -- provider account id, e.g. Intervals athlete id "i123456"
access_token      text NOT NULL  (encrypted at rest)
refresh_token     text NOT NULL  (encrypted at rest)
token_expires_at  timestamptz NOT NULL
scopes            text NOT NULL                 -- e.g. "ACTIVITY:READ"
status            text NOT NULL DEFAULT 'active' -- active | revoked | error
connected_at      timestamptz DEFAULT now()
last_synced_at    timestamptz NULL
UNIQUE (user_id, provider)

activities
──────────────────────────────────────
id                    uuid PK
user_id               uuid FK -> user.id
intervals_activity_id text NOT NULL         -- id from Intervals.icu
name                  text
type                  text                  -- Run, Ride, Swim, etc.
start_date_local      timestamptz NOT NULL
moving_time_seconds   integer
elapsed_time_seconds  integer
distance_meters       numeric
average_hr            integer NULL
raw_payload           jsonb                 -- full API response, for future-proofing
synced_at             timestamptz DEFAULT now()
UNIQUE (user_id, intervals_activity_id)
```

Storing `raw_payload` as JSONB means you don't have to re-sync historical data every time you decide to surface a new field later — including for the Roadmap items (analytics, AI coaching), which will likely read straight out of this column before any schema change is needed.

---

## 9. Intervals.icu Integration

Intervals.icu supports **OAuth 2.0 with granular scopes for third-party apps** — this is the correct auth method here (not the personal API key, which is meant for single-user/personal scripts).

**How this relates to BetterAuth:** this is a separate concern from user login. Two ways to implement it:
- **Recommended: hand-rolled**, using our own generic `connections` table and the flow below. Keeps provider integrations decoupled from the auth system, and gives full control over refresh — which you'll want, since:
- **Alternative: BetterAuth's Generic OAuth plugin** (`genericOAuth`, with `authClient.oauth2.link(...)` for account linking) can also drive the authorize/callback/token-storage steps. Worth knowing before you pick it: Intervals.icu isn't an OIDC provider (no discovery doc, no standard userinfo endpoint), so you'd configure `authorizationUrl`/`tokenUrl` manually and write a custom `getUserInfo`. More importantly, **BetterAuth's automatic token refresh only covers its built-in social providers (Google, GitHub, etc.) — not custom providers added via Generic OAuth** — so you'd still be writing your own refresh logic either way. Given that, the hand-rolled table below is the more predictable option and is what the rest of this spec assumes.

### 9.1 One-time setup (do this before development starts)
Email **david@intervals.icu** to register the app and get a `client_id` / `client_secret`. You need to provide:
- App name
- Description
- Website URL
- Logo (square, ≥128×128)
- Privacy policy URL
- Redirect URI(s) — `http://localhost/...` is always allowed, so local dev can start immediately while waiting on the production redirect URI to be approved.

### 9.2 OAuth flow
1. **Authorize:** redirect the user to
   `https://intervals.icu/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=ACTIVITY:READ&state=...`
   (use a random `state` for CSRF protection, verify it on callback)
2. **Callback → token exchange (server-side only):** `POST https://intervals.icu/api/v1/oauth/token` with `grant_type=authorization_code`, exchanging the code for `access_token`, `refresh_token`, `expires_in`, `scope`.
3. Store the tokens (encrypted) in `connections` with `provider = 'intervals_icu'`.
4. **Refresh:** before `token_expires_at`, use the refresh token to get a new access token (implement this as a scheduled check or lazily on 401).
5. **Disconnect:** on user request, revoke locally (delete row / mark `revoked`) and, if Intervals.icu exposes a revoke endpoint, call it too — otherwise instruct the user they can also revoke from their Intervals.icu account settings.

### 9.3 Scopes needed for MVP
`ACTIVITY:READ` is sufficient for the calendar view. Don't request `ACTIVITY:WRITE` or `WELLNESS:READ` yet — only request scopes you actually use, since users see exactly what they're granting.

### 9.4 Fetching activities
Use the athlete activities endpoint from the official API docs (**https://intervals.icu/api-docs.html** — treat this as the source of truth for exact query params, since the endpoint surface changes; don't hardcode assumptions here). Fetch a reasonable initial window (e.g. last 90 days) on first connect, then sync incrementally after that.

### 9.5 Sync strategy for MVP
- On connect: fetch historical activities, insert into `activities`.
- On calendar view load: if `last_synced_at` is older than e.g. 15 minutes, trigger a background re-sync; otherwise serve from Postgres (fast, no dependency on Intervals.icu being up).
- Provide a manual "Sync now" button as a fallback.
- (Future improvement, not MVP: Intervals.icu supports webhooks for activity uploads — worth revisiting once the polling approach feels laggy.)

---

## 10. Backend API Contract (MVP)

```
Auth (mounted by BetterAuth itself, not hand-built — typically under /api/auth/*)
POST   /api/auth/sign-up/email
POST   /api/auth/sign-in/email
POST   /api/auth/sign-out
GET    /api/auth/token              (issue/refresh the bearer token for mobile clients)

User
GET    /api/v1/me
PATCH  /api/v1/me                    (MVP: update display name only)

Intervals.icu integration
GET    /api/v1/integrations/intervals-icu/authorize-url
GET    /api/v1/integrations/intervals-icu/callback     (OAuth redirect target)
GET    /api/v1/integrations/intervals-icu/status
DELETE /api/v1/integrations/intervals-icu

Activities / Calendar
GET    /api/v1/activities?start=YYYY-MM-DD&end=YYYY-MM-DD
POST   /api/v1/activities/sync
```

All `/api/v1/*` endpoints require a valid session — either the BetterAuth session cookie (web) or an `Authorization: Bearer <token>` header (mobile, or any non-browser client), validated server-side via `auth.api.getSession()`.

---

## 11. Frontend Requirements

### Marketing site (public)
- Homepage explaining the product, with a clear "Sign up" CTA.
- Login link.
- Doesn't need to be fancy for MVP — a single well-designed landing page is enough to start.
- Use Tailwind CSS for styling, consuming the shared Tailwind preset from `packages/tailwind-config`.

### Web app (authenticated)
- Signup / login screens are functional BetterAuth email/password forms using ShadCN-style UI primitives, adapted from `/home/wim/Code/Repositories/Personal/Boilerplate-MultiTenant` where useful.
- Empty state: "Connect your Intervals.icu account" if not yet connected → triggers OAuth flow.
- Calendar view: month grid, one cell per day, showing activity type icon + name + duration/distance summary. Prev/next month navigation. *(Phase 0 — activities are visible but not yet clickable.)*
- Settings page: shows Intervals.icu connection status, "Disconnect" button.
- Settings page: includes a profile section for editing display name; email remains read-only until a verified email-change flow is added.
- *(Phase 1, right after: clicking a day/activity opens a detail view with the fields already stored in the `activities` table.)*
- Use Tailwind CSS and ShadCN-style local UI primitives for styling, consuming the shared Tailwind preset from `packages/tailwind-config`.

---

## 12. Security Requirements

- HTTPS everywhere, no exceptions.
- Encrypt the `access_token` / `refresh_token` columns on `connections` at rest (e.g. `pgcrypto`, or app-level encryption with a secret held outside the DB — never store OAuth tokens in plaintext). This is separate from BetterAuth's own tables, which handle password hashing internally.
- Rate-limit BetterAuth's `/api/auth/*` endpoints (built-in rate limiting can be enabled in its config).
- Validate the `state` parameter on the Intervals.icu OAuth callback to prevent CSRF.
- Sessions/bearer tokens should be revocable per-device — BetterAuth supports listing and revoking individual sessions out of the box (useful once mobile exists and a user wants to log out one device without logging out everywhere).
- Standard input validation on every endpoint (e.g. zod schemas).

---

## 13. Non-Functional Requirements

- API versioned at `/api/v1` from day one — mobile clients will pin to a version.
- Structured logging + error tracking (e.g. Sentry) from the start.
- Migrations must be reproducible (Prisma/Drizzle migration files checked into git, not manual DB edits).
- Automated tests at minimum for: signup/login, OAuth token exchange + refresh logic, activity sync deduplication (the `UNIQUE (user_id, intervals_activity_id)` constraint).
- Environment config via `.env` for local/staging/prod, with separate Intervals.icu redirect URIs registered per environment.

---

## 14. Open Questions (resolve before/while building)

- App name & domain (affects the Intervals.icu app registration — website URL, redirect URI, logo).
- Hosting/infra preference (Vercel + Render/Fly.io + managed Postgres vs. self-hosted, etc.).
- BetterAuth database adapter: direct Kysely/Postgres vs. wiring it through Prisma/Drizzle if the rest of the API uses one of those as its ORM — pick whichever keeps a single source of truth for the schema.
- Repo strategy: single monorepo (recommended above) vs. separate repos for marketing/web/api.
- Which activity types to support — Intervals.icu is multi-sport, so default to supporting all types generically rather than assuming running-only.

---

## 15. Suggested Build Order

**Phase 0 (this spec):**
1. Monorepo scaffolding, env config, CI skeleton
2. Postgres schema + migrations (BetterAuth tables + our own app tables in Drizzle)
3. Backend: BetterAuth setup (email/password, `bearer` plugin)
4. Backend: Intervals.icu OAuth connect/callback/disconnect
5. Backend: activity sync job + `GET /activities`
6. Web app: functional auth screens via BetterAuth's client SDK, styled with ShadCN-style primitives
7. Web app: "Connect Intervals.icu" flow
8. Web app: calendar view (no click-through yet)
9. Marketing site: homepage
10. Deploy all three apps, point production redirect URI to Intervals.icu for final OAuth approval

**Phase 1 (right after):**
11. Web app: activity detail view on click

**Then, one at a time, only once the above is stable:** analytics dashboard → AI coaching → training plan generation (see Section 4).
