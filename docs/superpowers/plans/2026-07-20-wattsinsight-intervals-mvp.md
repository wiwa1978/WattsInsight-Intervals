# WattsInsight MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 0 WattsInsight feature from `requirements.md` — Intervals.icu OAuth connection, activity sync into Postgres, and an authenticated calendar view — as an addition **on top of** the already-built SaaS boilerplate in this repository. Auth, billing, i18n, and the admin app already exist and are fully functional; this plan does not recreate or scaffold any of that.

**Architecture:** This repo is a working Bun-workspaces monorepo (`saas-platform-monorepo`) with three apps — `apps/api` (Hono), `apps/web` (Next.js 16, port 3100), `apps/admin` (Next.js 16, port 3101) — and a set of shared `@platform/*` packages (`platform-db`, `contracts`, `auth-core`, `frontend-shared`, etc.). `apps/api/src/bootstrap.ts` is the composition root that wires every domain service together and configures BetterAuth (email/password, 2FA, passkeys, magic link, admin plugin, Dodo Payments billing) plus a custom mobile JWT flow. WattsInsight is added as one more vertical slice inside this existing structure: a Postgres schema addition, a service registered in `bootstrap.ts`, Hono routes mounted in `app.ts`, and new pages inside the existing `apps/web` Next.js app — reusing the existing session, i18n, and UI-primitive infrastructure rather than rebuilding it.

**Tech Stack (already in place, not being introduced):** Bun workspaces, Hono, Drizzle ORM, PostgreSQL, BetterAuth, Next.js 16 App Router with `next-intl`, TanStack Query, Tailwind CSS v4, Radix-based UI primitives, Vitest, Playwright.

---

## Confirmed Decisions

- This is **not** a new monorepo. `apps/api`, `apps/web`, and `apps/admin` already exist, already run, and already have working auth/billing/i18n. No scaffolding tasks are needed.
- ORM: Drizzle (already the project's ORM).
- Auth: reuse the existing BetterAuth session (email/password, email verification, optional 2FA/passkeys/magic link) already configured in `apps/api/src/bootstrap.ts`. No new auth flow is introduced for WattsInsight; the existing mobile JWT bearer flow already covers any future mobile client.
- API Framework: Hono, via the existing `apps/api/src/app.ts` router composition — not a new server.
- Web app: the existing `apps/web` Next.js app. No new frontend app is created.
- Admin dashboard: out of scope for Phase 0. The existing `apps/admin` app is untouched — WattsInsight has no admin-specific surface yet (connection troubleshooting/admin visibility can be a later phase if needed).
- Styling: reuse the existing Tailwind v4 setup and `apps/web/src/components/ui/*` Radix-based primitives; no new design system.
- Single agent/session owns this work end-to-end since it's additive to one already-cohesive codebase (no cross-app scaffolding to split by ownership).

## Isolation Strategy

The goal is for future boilerplate updates (auth, billing, admin, i18n core) to be pullable later without touching WattsInsight-specific code, and vice versa. This repo has no precedent for a per-feature package scope (every existing domain lives directly under `@platform/*` and inline in `apps/*`), so the choices below are recommended defaults, not an existing convention — flagging clearly so they're easy to redirect:

- **New package scope `@wattsinsight/*`** instead of adding files into `@platform/contracts` or elsewhere: `packages/wattsinsight-contracts` (wire schemas) and `packages/wattsinsight-core` (framework-agnostic domain logic — token crypto, Intervals.icu OAuth client, activity normalization). Nothing platform-owned needs to change to add or remove these packages.
- **Frontend pages live under the existing `(backend)` route group**, as `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/` and `.../wattsinsight/calendar/`, the same way `dashboard`, `billing`, and `settings` already do. This is a deliberate change from an earlier draft that proposed a separate `(wattsinsight)` route group — the user asked for WattsInsight pages to be visibly and structurally part of the authenticated backend area, not a parallel silo, so they reuse `(backend)/layout.tsx`'s session guard, sidebar, and banner directly instead of duplicating that shell. Code-level isolation (schema file, contracts package, core package, service module) still applies; only the route grouping is shared.
- **Unavoidable shared integration points** (this repo has one Hono app, one Postgres schema/migration history, and one BetterAuth instance — these cannot be forked without duplicating the boilerplate itself):
  - `packages/platform-db/src/schema/wattsinsight.ts` is a new file, but it must be re-exported from the shared `packages/platform-db/src/schema/index.ts` barrel and its migration lands in the single shared `packages/platform-db/drizzle/` history.
  - `apps/api/src/bootstrap.ts` gets one new service registered alongside the existing ones.
  - `apps/api/src/app.ts` gets two new `app.route(...)` calls mounting WattsInsight routers.
  - `apps/api/src/env.ts` gets new optional env vars for Intervals.icu OAuth + token encryption.
  - `apps/api/src/config/application.ts` gets one new `wattsinsight: true` entry in the existing `applicationConfig.features` flag registry, so the feature can be toggled off the same way `billing`/`notifications`/`discounts`/`vouchers` already are.
  - `apps/web/src/config/backend-navbar-dashboard.ts` gets two new entries in `BackendNavItems` (Connections, Calendar) so WattsInsight shows up in the existing sidebar alongside Dashboard/Billing, following the same `BackendNavDashboardItem` shape.

## Recommended Approach

Follow the boilerplate's existing per-domain "vertical slice" convention (seen in `modules/notifications`, `modules/billing`, etc.): DB schema → wire contracts → service factory (`createXService({ db })`) → Hono router → registration in `bootstrap.ts`/`app.ts` → frontend `lib/api/*.ts` client → page under a route group → i18n message keys in all three locale files. The only deviation from that convention is pushing the OAuth/crypto/normalization logic into standalone `@wattsinsight/*` packages instead of directly into `apps/api/src/modules/wattsinsight/`, for the isolation reasons above. Keep sync as on-demand (triggered by a "Sync now" button and on connect), matching this repo's existing `jobsRunner` pattern only if a periodic job turns out to be needed later — not required for Phase 0.

## File Structure

New packages:

- Create `packages/wattsinsight-contracts/package.json`, `tsconfig.json`, `src/wire/connections.ts`, `src/wire/activities.ts`, `src/wire/index.ts`, `src/index.ts`.
- Create `packages/wattsinsight-core/package.json`, `tsconfig.json`, `src/crypto.ts`, `src/intervals-client.ts`, `src/activity-normalizer.ts`, `src/index.ts`.

Shared integration points (modified, not created from scratch):

- Create `packages/platform-db/src/schema/wattsinsight.ts`; modify `packages/platform-db/src/schema/index.ts` to add the barrel export.
- Modify `apps/api/src/env.ts` to add `INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET`, `INTERVALS_REDIRECT_URI`, `WATTSINSIGHT_TOKEN_ENCRYPTION_KEY`.
- Modify `apps/api/src/bootstrap.ts` to construct and export `wattsInsightService`.
- Modify `apps/api/src/app.ts` to mount the new routers.
- Modify `apps/api/.env` (and document in `.env.example` if one exists) with the new env vars.

New backend files:

- Create `apps/api/src/modules/wattsinsight/service.ts`: DB-aware service factory (`createWattsInsightService({ db })`) wrapping `@wattsinsight/core` for OAuth exchange, token refresh, and activity sync/upsert.
- Create `apps/api/src/routes/wattsinsight-connections.ts`: authorize-URL, OAuth callback, status, disconnect.
- Create `apps/api/src/routes/wattsinsight-activities.ts`: list activities, trigger sync.

New frontend files (inside the existing `apps/web` app, under the existing `(backend)` route group):

- Create `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/page.tsx` + `client-wrapper.tsx`: Intervals.icu connect/disconnect UI.
- Create `apps/web/src/app/[locale]/(backend)/wattsinsight/calendar/page.tsx` + `client-wrapper.tsx`: month calendar view.
- Create `apps/web/src/components/wattsinsight/calendar-month.tsx`, `activity-pill.tsx`.
- Create `apps/web/src/lib/api/wattsinsight.ts`: `apiRequest`-based client functions parsing `@wattsinsight/contracts/wire` schemas.
- Modify `apps/web/src/config/backend-navbar-dashboard.ts`: add Connections/Calendar entries to `BackendNavItems`.
- Modify `apps/web/src/messages/en.json`, `fr.json`, `nl.json`: add a `wattsinsight` message namespace to all three (required for `messages.test.ts` shape parity).

---

### Task 1: Add WattsInsight Database Schema

**Files:**

- Create: `packages/platform-db/src/schema/wattsinsight.ts`
- Modify: `packages/platform-db/src/schema/index.ts`
- Generate: a new file under `packages/platform-db/drizzle/`

- [ ] **Step 1: Add the schema file**

Create `packages/platform-db/src/schema/wattsinsight.ts`, following the same column-helper and index conventions as `packages/platform-db/src/schema/notifications.ts`:

```ts
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const intervalsConnection = pgTable(
  "intervals_connection",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    athleteId: text("athlete_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    scope: text("scope").notNull(),
    status: text("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("intervals_connection_user_unique").on(table.userId)],
);

export const intervalsActivity = pgTable(
  "intervals_activity",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id")
      .references(() => intervalsConnection.id, { onDelete: "cascade" })
      .notNull(),
    intervalsActivityId: text("intervals_activity_id").notNull(),
    name: text("name"),
    type: text("type"),
    startDateLocal: timestamp("start_date_local", { withTimezone: true }).notNull(),
    movingTimeSeconds: integer("moving_time_seconds"),
    elapsedTimeSeconds: integer("elapsed_time_seconds"),
    distanceMeters: numeric("distance_meters"),
    averageHr: integer("average_hr"),
    rawPayload: jsonb("raw_payload"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("intervals_activity_user_activity_unique").on(table.userId, table.intervalsActivityId),
    index("intervals_activity_user_start_idx").on(table.userId, table.startDateLocal),
  ],
);
```

Tokens are stored encrypted (via `@wattsinsight/core`'s crypto helpers) before insert, so `accessToken`/`refreshToken` hold ciphertext, not plaintext.

- [ ] **Step 2: Register the barrel export**

Modify `packages/platform-db/src/schema/index.ts` to add:

```ts
export * from "./wattsinsight";
```

- [ ] **Step 3: Generate and review the migration**

Run from the repo root (the single shared migration history lives in `packages/platform-db/drizzle/`):

```bash
bun run db:generate
```

Expected: a new SQL file appears under `packages/platform-db/drizzle/` containing only the two new tables (`intervals_connection`, `intervals_activity`) — no unrelated diffs against existing boilerplate tables. Review the generated SQL before applying it.

- [ ] **Step 4: Apply the migration to the local database**

Run:

```bash
bun run db:migrate
```

Expected: command exits successfully and `intervals_connection`/`intervals_activity` exist in the target database from `apps/api/.env`'s `DATABASE_URL`.

---

### Task 2: Create `@wattsinsight/contracts` Package

**Files:**

- Create: `packages/wattsinsight-contracts/package.json`
- Create: `packages/wattsinsight-contracts/tsconfig.json`
- Create: `packages/wattsinsight-contracts/src/wire/connections.ts`
- Create: `packages/wattsinsight-contracts/src/wire/activities.ts`
- Create: `packages/wattsinsight-contracts/src/wire/index.ts`
- Create: `packages/wattsinsight-contracts/src/index.ts`

- [ ] **Step 1: Create package metadata**

Create `packages/wattsinsight-contracts/package.json`, matching the subpath-export convention used by `@platform/contracts`:

```json
{
  "name": "@wattsinsight/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./wire": {
      "types": "./src/wire/index.ts",
      "default": "./src/wire/index.ts"
    }
  },
  "dependencies": {
    "zod": "^4.2.1"
  }
}
```

Create `packages/wattsinsight-contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Add connection wire schemas**

Create `packages/wattsinsight-contracts/src/wire/connections.ts`:

```ts
import { z } from "zod";

export const intervalsConnectionStatusSchema = z.object({
  connected: z.boolean(),
  status: z.enum(["active", "revoked", "error"]).nullable(),
  athleteId: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
});

export const intervalsAuthorizeUrlResponseSchema = z.object({
  url: z.string().url(),
});

export const intervalsDisconnectResponseSchema = z.object({
  disconnected: z.boolean(),
});

export type IntervalsConnectionStatus = z.infer<typeof intervalsConnectionStatusSchema>;
export type IntervalsAuthorizeUrlResponse = z.infer<typeof intervalsAuthorizeUrlResponseSchema>;
export type IntervalsDisconnectResponse = z.infer<typeof intervalsDisconnectResponseSchema>;
```

- [ ] **Step 3: Add activity wire schemas**

Create `packages/wattsinsight-contracts/src/wire/activities.ts`:

```ts
import { z } from "zod";

export const intervalsActivityQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const intervalsActivitySchema = z.object({
  id: z.string(),
  intervalsActivityId: z.string(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  startDateLocal: z.string(),
  movingTimeSeconds: z.number().nullable(),
  elapsedTimeSeconds: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  averageHr: z.number().nullable(),
});

export const intervalsActivitiesResponseSchema = z.object({
  activities: z.array(intervalsActivitySchema),
});

export const intervalsSyncResponseSchema = z.object({
  synced: z.boolean(),
  insertedOrUpdated: z.number().int().nonnegative(),
});

export type IntervalsActivityQuery = z.infer<typeof intervalsActivityQuerySchema>;
export type IntervalsActivityDto = z.infer<typeof intervalsActivitySchema>;
export type IntervalsActivitiesResponse = z.infer<typeof intervalsActivitiesResponseSchema>;
export type IntervalsSyncResponse = z.infer<typeof intervalsSyncResponseSchema>;
```

- [ ] **Step 4: Add barrel exports**

Create `packages/wattsinsight-contracts/src/wire/index.ts`:

```ts
export * from "./connections";
export * from "./activities";
```

Create `packages/wattsinsight-contracts/src/index.ts`:

```ts
export * from "./wire";
```

- [ ] **Step 5: Add as a workspace dependency and verify typecheck**

Add `"@wattsinsight/contracts": "*"` to `apps/api/package.json` and `apps/web/package.json` dependencies, then run:

```bash
bun install
bun run --cwd packages/wattsinsight-contracts typecheck
```

Expected: install links the new workspace package and typecheck exits successfully.

---

### Task 3: Create `@wattsinsight/core` Package

**Files:**

- Create: `packages/wattsinsight-core/package.json`
- Create: `packages/wattsinsight-core/tsconfig.json`
- Create: `packages/wattsinsight-core/src/crypto.ts`
- Create: `packages/wattsinsight-core/src/intervals-client.ts`
- Create: `packages/wattsinsight-core/src/activity-normalizer.ts`
- Create: `packages/wattsinsight-core/src/index.ts`
- Test: `packages/wattsinsight-core/tests/crypto.test.ts`
- Test: `packages/wattsinsight-core/tests/activity-normalizer.test.ts`

This package is framework/DB-agnostic on purpose — no imports from `@platform/platform-db` or Hono — so it stays reusable and easy to update independently of both the boilerplate and the API's wiring.

- [ ] **Step 1: Create package metadata**

Create `packages/wattsinsight-core/package.json`:

```json
{
  "name": "@wattsinsight/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run tests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wattsinsight/contracts": "*"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Create `packages/wattsinsight-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 2: Write and implement token encryption**

Create `packages/wattsinsight-core/tests/crypto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../src/crypto";

describe("token encryption", () => {
  it("encrypts tokens without preserving plaintext", () => {
    const key = "0".repeat(32);
    const encrypted = encryptToken("access-token-123", key);

    expect(encrypted).not.toContain("access-token-123");
    expect(decryptToken(encrypted, key)).toBe("access-token-123");
  });
});
```

Create `packages/wattsinsight-core/src/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBuffer(key: string) {
  const raw = Buffer.from(key, "base64");
  return raw.length === 32 ? raw : Buffer.from(key.padEnd(32, "0")).subarray(0, 32);
}

export function encryptToken(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(value: string, key: string) {
  const [ivBase64, tagBase64, encryptedBase64] = value.split(".");
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(key), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 3: Implement the Intervals.icu OAuth client**

Create `packages/wattsinsight-core/src/intervals-client.ts`:

```ts
export type IntervalsTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  athlete_id?: string;
};

export type IntervalsOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function buildIntervalsAuthorizeUrl(config: IntervalsOAuthConfig, state: string) {
  const url = new URL("https://intervals.icu/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ACTIVITY:READ");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeIntervalsCode(config: IntervalsOAuthConfig, code: string) {
  return requestIntervalsToken({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
}

export async function refreshIntervalsToken(config: IntervalsOAuthConfig, refreshToken: string) {
  return requestIntervalsToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

async function requestIntervalsToken(body: Record<string, string>) {
  const response = await fetch("https://intervals.icu/api/v1/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    throw new Error(`Intervals token request failed: ${response.status}`);
  }

  return response.json() as Promise<IntervalsTokenResponse>;
}

export async function fetchIntervalsActivities(accessToken: string, athleteId: string, range: { start: string; end: string }) {
  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/activities`);
  url.searchParams.set("oldest", range.start);
  url.searchParams.set("newest", range.end);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Intervals activities request failed: ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>[]>;
}
```

- [ ] **Step 4: Write and implement activity normalization**

Create `packages/wattsinsight-core/tests/activity-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeIntervalsActivity } from "../src/activity-normalizer";

describe("activity normalization", () => {
  it("normalizes an Intervals.icu payload for storage", () => {
    const normalized = normalizeIntervalsActivity({
      id: "abc123",
      name: "Morning Ride",
      type: "Ride",
      start_date_local: "2026-07-20T07:30:00+02:00",
      moving_time: 3600,
      elapsed_time: 3900,
      distance: 25000,
      average_heartrate: 145,
    });

    expect(normalized).toEqual({
      intervalsActivityId: "abc123",
      name: "Morning Ride",
      type: "Ride",
      startDateLocal: new Date("2026-07-20T07:30:00+02:00"),
      movingTimeSeconds: 3600,
      elapsedTimeSeconds: 3900,
      distanceMeters: "25000",
      averageHr: 145,
      rawPayload: expect.any(Object),
    });
  });
});
```

Create `packages/wattsinsight-core/src/activity-normalizer.ts`:

```ts
type IntervalsActivityPayload = Record<string, unknown>;

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numericStringOrNull(value: unknown) {
  return typeof value === "number" ? String(value) : null;
}

export function normalizeIntervalsActivity(payload: IntervalsActivityPayload) {
  const id = payload.id;
  const startDate = payload.start_date_local ?? payload.start_date;

  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error("Intervals activity is missing id");
  }

  if (typeof startDate !== "string") {
    throw new Error("Intervals activity is missing start date");
  }

  return {
    intervalsActivityId: String(id),
    name: stringOrNull(payload.name),
    type: stringOrNull(payload.type),
    startDateLocal: new Date(startDate),
    movingTimeSeconds: numberOrNull(payload.moving_time),
    elapsedTimeSeconds: numberOrNull(payload.elapsed_time),
    distanceMeters: numericStringOrNull(payload.distance),
    averageHr: numberOrNull(payload.average_heartrate),
    rawPayload: payload,
  };
}
```

- [ ] **Step 5: Add barrel export and verify tests**

Create `packages/wattsinsight-core/src/index.ts`:

```ts
export * from "./crypto";
export * from "./intervals-client";
export * from "./activity-normalizer";
```

Run:

```bash
bun install
bun run --cwd packages/wattsinsight-core test
bun run --cwd packages/wattsinsight-core typecheck
```

Expected: both commands exit successfully.

---

### Task 4: Wire Up The API — Service, Routes, Bootstrap

**Files:**

- Modify: `apps/api/src/config/application.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env`
- Create: `apps/api/src/modules/wattsinsight/service.ts`
- Create: `apps/api/src/routes/wattsinsight-connections.ts`
- Create: `apps/api/src/routes/wattsinsight-activities.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/package.json` (add `@wattsinsight/core`, `@wattsinsight/contracts` dependencies)

- [ ] **Step 1: Register the feature flag**

Modify `apps/api/src/config/application.ts` to add `wattsinsight: true` to `applicationConfig.features`, following the existing `billing`/`notifications`/`discounts`/`vouchers` pattern. This lets the new routes/service be gated off with one flag flip if needed, without touching auth/billing code.

- [ ] **Step 2: Add environment variables**

Modify `apps/api/src/env.ts` to add to `envSchema`:

```ts
  INTERVALS_CLIENT_ID: z.string().optional(),
  INTERVALS_CLIENT_SECRET: z.string().optional(),
  INTERVALS_REDIRECT_URI: z.string().url().optional(),
  WATTSINSIGHT_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
```

Add corresponding local values to `apps/api/.env`:

```env
INTERVALS_CLIENT_ID=replace-me
INTERVALS_CLIENT_SECRET=replace-me
INTERVALS_REDIRECT_URI=http://192.168.1.213:8787/wattsinsight/connections/callback
WATTSINSIGHT_TOKEN_ENCRYPTION_KEY=replace-with-32-byte-base64-key
```

- [ ] **Step 3: Implement the DB-aware service factory**

Create `apps/api/src/modules/wattsinsight/service.ts`, following the `createXService({ db })` factory pattern used by `apps/api/src/modules/notifications/service.ts`:

```ts
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { intervalsActivity, intervalsConnection } from "@platform/platform-db";
import {
  buildIntervalsAuthorizeUrl,
  decryptToken,
  encryptToken,
  exchangeIntervalsCode,
  fetchIntervalsActivities,
  normalizeIntervalsActivity,
  refreshIntervalsToken,
  type IntervalsOAuthConfig,
} from "@wattsinsight/core";

type WattsInsightServiceDeps = {
  db: any;
  oauthConfig: IntervalsOAuthConfig;
  tokenEncryptionKey: string;
};

export function createWattsInsightService(deps: WattsInsightServiceDeps) {
  const { db, oauthConfig, tokenEncryptionKey } = deps;

  function buildAuthorizeUrl(state: string) {
    return buildIntervalsAuthorizeUrl(oauthConfig, state);
  }

  async function connect(userId: string, code: string) {
    const token = await exchangeIntervalsCode(oauthConfig, code);

    await db
      .insert(intervalsConnection)
      .values({
        userId,
        athleteId: token.athlete_id ?? "",
        accessToken: encryptToken(token.access_token, tokenEncryptionKey),
        refreshToken: encryptToken(token.refresh_token, tokenEncryptionKey),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: token.scope,
        status: "active",
      })
      .onConflictDoUpdate({
        target: intervalsConnection.userId,
        set: {
          athleteId: token.athlete_id ?? "",
          accessToken: encryptToken(token.access_token, tokenEncryptionKey),
          refreshToken: encryptToken(token.refresh_token, tokenEncryptionKey),
          tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
          scope: token.scope,
          status: "active",
        },
      });
  }

  async function getStatus(userId: string) {
    const [connection] = await db
      .select()
      .from(intervalsConnection)
      .where(eq(intervalsConnection.userId, userId))
      .limit(1);

    if (!connection) {
      return { connected: false, status: null, athleteId: null, lastSyncedAt: null };
    }

    return {
      connected: connection.status === "active",
      status: connection.status,
      athleteId: connection.athleteId,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    };
  }

  async function disconnect(userId: string) {
    await db
      .update(intervalsConnection)
      .set({ status: "revoked" })
      .where(eq(intervalsConnection.userId, userId));

    return { disconnected: true };
  }

  async function getActiveConnection(userId: string) {
    const [connection] = await db
      .select()
      .from(intervalsConnection)
      .where(and(eq(intervalsConnection.userId, userId), eq(intervalsConnection.status, "active")))
      .limit(1);

    return connection ?? null;
  }

  async function ensureFreshAccessToken(connection: typeof intervalsConnection.$inferSelect) {
    if (connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
      return decryptToken(connection.accessToken, tokenEncryptionKey);
    }

    const refreshed = await refreshIntervalsToken(oauthConfig, decryptToken(connection.refreshToken, tokenEncryptionKey));

    await db
      .update(intervalsConnection)
      .set({
        accessToken: encryptToken(refreshed.access_token, tokenEncryptionKey),
        refreshToken: encryptToken(refreshed.refresh_token, tokenEncryptionKey),
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      })
      .where(eq(intervalsConnection.id, connection.id));

    return refreshed.access_token;
  }

  async function listActivities(userId: string, range: { start: string; end: string }) {
    return db
      .select()
      .from(intervalsActivity)
      .where(
        and(
          eq(intervalsActivity.userId, userId),
          gte(intervalsActivity.startDateLocal, new Date(range.start)),
          lte(intervalsActivity.startDateLocal, new Date(range.end)),
        ),
      )
      .orderBy(desc(intervalsActivity.startDateLocal));
  }

  async function syncActivities(userId: string, range: { start: string; end: string }) {
    const connection = await getActiveConnection(userId);
    if (!connection) {
      throw new Error("No active Intervals.icu connection");
    }

    const accessToken = await ensureFreshAccessToken(connection);
    const rawActivities = await fetchIntervalsActivities(accessToken, connection.athleteId, range);

    let insertedOrUpdated = 0;
    for (const raw of rawActivities) {
      const normalized = normalizeIntervalsActivity(raw);

      await db
        .insert(intervalsActivity)
        .values({ userId, connectionId: connection.id, ...normalized })
        .onConflictDoUpdate({
          target: [intervalsActivity.userId, intervalsActivity.intervalsActivityId],
          set: normalized,
        });

      insertedOrUpdated += 1;
    }

    await db
      .update(intervalsConnection)
      .set({ lastSyncedAt: new Date() })
      .where(eq(intervalsConnection.id, connection.id));

    return { synced: true, insertedOrUpdated };
  }

  return { buildAuthorizeUrl, connect, getStatus, disconnect, listActivities, syncActivities };
}
```

- [ ] **Step 4: Register the service in `bootstrap.ts`**

Modify `apps/api/src/bootstrap.ts`: add the import

```ts
import { createWattsInsightService } from "./modules/wattsinsight/service";
```

add construction (near the other `const xService = createXService({ db })` lines):

```ts
const wattsInsightService = createWattsInsightService({
  db,
  oauthConfig: {
    clientId: env.INTERVALS_CLIENT_ID ?? "",
    clientSecret: env.INTERVALS_CLIENT_SECRET ?? "",
    redirectUri: env.INTERVALS_REDIRECT_URI ?? "",
  },
  tokenEncryptionKey: env.WATTSINSIGHT_TOKEN_ENCRYPTION_KEY ?? "",
});
```

and add `wattsInsightService,` to the exported `bootstrap` object.

- [ ] **Step 5: Add the Hono routers**

Create `apps/api/src/routes/wattsinsight-connections.ts`, following the router-factory pattern in `apps/api/src/routes/me.ts` (auth middleware applied per-router, `lib/http` response helpers, `bootstrap` for services):

```ts
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { badRequest, ok } from "../lib/http";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createWattsInsightConnectionsRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/authorize-url", (c) => {
    const state = randomBytes(24).toString("base64url");
    return ok(c, { url: bootstrap.wattsInsightService.buildAuthorizeUrl(state) });
  });

  router.get("/status", async (c) => {
    const authUser = getAuthUser(c);
    return ok(c, await bootstrap.wattsInsightService.getStatus(authUser.id));
  });

  router.post("/callback", async (c) => {
    const authUser = getAuthUser(c);
    const { code } = await c.req.json();
    if (typeof code !== "string") {
      return badRequest(c, "Missing OAuth code");
    }

    await bootstrap.wattsInsightService.connect(authUser.id, code);
    return ok(c, { connected: true });
  });

  router.delete("/", async (c) => {
    const authUser = getAuthUser(c);
    return ok(c, await bootstrap.wattsInsightService.disconnect(authUser.id));
  });

  return router;
}
```

Create `apps/api/src/routes/wattsinsight-activities.ts`:

```ts
import { Hono } from "hono";
import type { Context } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { badRequest, ok } from "../lib/http";
import { parseQuery } from "../lib/http";
import { intervalsActivityQuerySchema } from "@wattsinsight/contracts/wire";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createWattsInsightActivitiesRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/", async (c) => {
    const authUser = getAuthUser(c);
    const parsed = parseQuery(intervalsActivityQuerySchema, c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Invalid activity query");
    }

    return ok(c, { activities: await bootstrap.wattsInsightService.listActivities(authUser.id, parsed.data) });
  });

  router.post("/sync", async (c) => {
    const authUser = getAuthUser(c);
    const parsed = parseQuery(intervalsActivityQuerySchema, c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Invalid sync range");
    }

    return ok(c, await bootstrap.wattsInsightService.syncActivities(authUser.id, parsed.data));
  });

  return router;
}
```

- [ ] **Step 6: Mount the routers in `app.ts`**

Modify `apps/api/src/app.ts`: add imports

```ts
import { createWattsInsightConnectionsRouter } from "./routes/wattsinsight-connections";
import { createWattsInsightActivitiesRouter } from "./routes/wattsinsight-activities";
```

and mount alongside the existing `app.route("/me", createMeRouter());` line:

```ts
app.route("/wattsinsight/connections", createWattsInsightConnectionsRouter());
app.route("/wattsinsight/activities", createWattsInsightActivitiesRouter());
```

- [ ] **Step 7: Verify the API boots and typechecks**

Run:

```bash
bun install
bun run --cwd apps/api typecheck
bun run dev:api
```

Expected: typecheck passes; the API starts and `GET /wattsinsight/connections/status` returns `401` without a session cookie.

---

### Task 5: Frontend — Intervals.icu Connection Page

**Files:**

- Create: `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/client-wrapper.tsx`
- Create: `apps/web/src/lib/api/wattsinsight.ts`
- Modify: `apps/web/src/config/backend-navbar-dashboard.ts`
- Modify: `apps/web/package.json` (add `@wattsinsight/contracts` dependency)

These pages live directly inside the existing `(backend)` route group, next to `dashboard/`, `billing/`, and `settings/` — not in a separate route group. `apps/web/src/app/[locale]/(backend)/layout.tsx` already handles the session guard, sidebar, and banner notification for every page in this group, so no new layout file is needed here.

- [ ] **Step 1: Add the API client module**

Create `apps/web/src/lib/api/wattsinsight.ts`, following the `apiRequest`-based pattern in `apps/web/src/lib/api/me.ts`:

```ts
import {
  intervalsAuthorizeUrlResponseSchema,
  intervalsConnectionStatusSchema,
  intervalsDisconnectResponseSchema,
} from "@wattsinsight/contracts/wire";

import { apiRequest } from "./client";

export async function getIntervalsStatus() {
  const result = await apiRequest("/wattsinsight/connections/status", { method: "GET" });
  return intervalsConnectionStatusSchema.parse(result.data);
}

export async function getIntervalsAuthorizeUrl() {
  const result = await apiRequest("/wattsinsight/connections/authorize-url", { method: "GET" });
  return intervalsAuthorizeUrlResponseSchema.parse(result.data);
}

export async function disconnectIntervals() {
  const result = await apiRequest("/wattsinsight/connections", { method: "DELETE" });
  return intervalsDisconnectResponseSchema.parse(result.data);
}
```

Confirm the exact signature/return shape of `apiRequest` in `apps/web/src/lib/api/client.ts` before wiring this up, and match it — the snippet above assumes it returns the parsed `{ success, data }` envelope like other `lib/api/*.ts` modules in this app.

- [ ] **Step 2: Add TanStack Query hooks and the connections page**

Create `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/client-wrapper.tsx` (`"use client"`) with `useQuery`/`useMutation` hooks calling the functions above, a `Connect your Intervals.icu account` empty state, a connect button that redirects to the authorize URL, and a disconnect button that invalidates the status query on success.

Create `apps/web/src/app/[locale]/(backend)/wattsinsight/connections/page.tsx` as a thin server component rendering `<ClientConnectionsWrapper />`, matching the RSC/client-wrapper split used by `apps/web/src/app/[locale]/(backend)/dashboard/page.tsx` + `client-wrapper.tsx`.

- [ ] **Step 3: Add sidebar navigation entries**

Modify `apps/web/src/config/backend-navbar-dashboard.ts` to add a "Connections" entry to `BackendNavItems` (`title: "wattsinsight.nav.connections"`, `url: "/wattsinsight/connections"`), following the exact shape of the existing `dashboard.nav.overview`/`dashboard.nav.billing` entries. This makes WattsInsight show up in the same sidebar as Dashboard/Billing rather than being reachable only by direct URL.

- [ ] **Step 4: Verify the page renders**

Run:

```bash
bun run dev:web
```

Expected: navigating to `/en/wattsinsight/connections` while logged in shows the empty "Connect your Intervals.icu account" state, and a "Connections" entry appears in the backend sidebar; logged out, it redirects to `/login`.

---

### Task 6: Frontend — Calendar View

**Files:**

- Create: `apps/web/src/app/[locale]/(backend)/wattsinsight/calendar/page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/wattsinsight/calendar/client-wrapper.tsx`
- Create: `apps/web/src/components/wattsinsight/calendar-month.tsx`
- Create: `apps/web/src/components/wattsinsight/activity-pill.tsx`
- Modify: `apps/web/src/lib/api/wattsinsight.ts` (add activity list/sync functions)
- Modify: `apps/web/src/config/backend-navbar-dashboard.ts` (add "Calendar" entry)

- [ ] **Step 1: Add activity API client functions**

Extend `apps/web/src/lib/api/wattsinsight.ts` with `getIntervalsActivities(range)` and `syncIntervalsActivities(range)`, parsing with `intervalsActivitiesResponseSchema` and `intervalsSyncResponseSchema` from `@wattsinsight/contracts/wire`.

- [ ] **Step 2: Render the month grid**

Create `apps/web/src/components/wattsinsight/calendar-month.tsx`: a seven-column month grid with previous/next navigation driven by a `month` search param (`YYYY-MM`, defaulting to the current month).

Create `apps/web/src/components/wattsinsight/activity-pill.tsx`: a non-clickable pill showing sport type, name, duration, and distance for one activity.

- [ ] **Step 3: Wire the calendar page**

Create `apps/web/src/app/[locale]/(backend)/wattsinsight/calendar/client-wrapper.tsx` (`"use client"`) using `useQuery` keyed on `['wattsinsight', 'activities', { start, end }]` for the visible month, and a "Sync now" button calling the sync mutation then invalidating that query.

Create `apps/web/src/app/[locale]/(backend)/wattsinsight/calendar/page.tsx` as the RSC entry point rendering the client wrapper, matching the existing dashboard page split.

- [ ] **Step 4: Add the sidebar entry and verify**

Modify `apps/web/src/config/backend-navbar-dashboard.ts` to add a "Calendar" entry (`title: "wattsinsight.nav.calendar"`, `url: "/wattsinsight/calendar"`) alongside the Connections entry from Task 5.

With an active Intervals.icu connection (Task 5), open `/en/wattsinsight/calendar`, confirm the month grid renders, click "Sync now", and confirm activity pills for the current month appear after the query invalidates.

---

### Task 7: Add i18n Message Keys

**Files:**

- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/fr.json`
- Modify: `apps/web/src/messages/nl.json`

- [ ] **Step 1: Add a `wattsinsight` namespace to all three locale files**

Add matching keys (connection empty state, connect/disconnect button labels, sync button, calendar navigation labels) under a new top-level `"wattsinsight"` key in `en.json`, `fr.json`, and `nl.json`. `apps/web/src/messages/messages.test.ts` asserts key-shape parity across all three locales sorted alphabetically — any key added to `en.json` must exist (translated) in `fr.json` and `nl.json` too, or the test fails.

- [ ] **Step 2: Verify parity**

Run:

```bash
bun run --cwd apps/web test src/messages/messages.test.ts
```

Expected: PASS.

---

### Task 8: Quality Gates

**Files:**

- No new files; verifies the whole workspace.

- [ ] **Step 1: Run workspace-wide checks**

Run from the repo root:

```bash
bun run db:check
bun run typecheck:all
bun run test:api
bun run test:web
bun run test:packages
```

Expected: all commands exit successfully with zero TypeScript errors and no failing tests.

- [ ] **Step 2: Run focused new-package checks**

Run:

```bash
bun run --cwd packages/wattsinsight-contracts typecheck
bun run --cwd packages/wattsinsight-core typecheck
bun run --cwd packages/wattsinsight-core test
```

Expected: all commands exit successfully.

- [ ] **Step 3: Manually verify both apps still boot together**

Run:

```bash
bun run dev
```

Expected: `apps/api`, `apps/web`, and `apps/admin` all start concurrently with no errors, confirming the new bootstrap/app.ts wiring didn't break existing boilerplate routes (auth, billing, admin).

---

### Task 9: Phase 0 Acceptance Test

**Files:**

- Read: `requirements.md`
- Verify: full workspace

- [ ] Existing boilerplate auth (login/signup/logout) is untouched and still works.
- [ ] `GET /wattsinsight/connections/status` and `GET /wattsinsight/activities` reject unauthenticated requests with `401`.
- [ ] Authenticated user can generate an Intervals.icu authorize URL and complete the OAuth callback.
- [ ] Tokens are encrypted (via `@wattsinsight/core`) before being stored in `intervals_connection`.
- [ ] User can see Intervals.icu connection status and disconnect.
- [ ] Activity sync stores activities in `intervals_activity` via Drizzle, deduplicated by `(user_id, intervals_activity_id)`.
- [ ] API routes validate requests/responses with `@wattsinsight/contracts/wire` schemas.
- [ ] Frontend parses API responses with the same shared Zod schemas before rendering.
- [ ] Calendar shows a month grid with activity name, sport type, duration, and distance; activities are visible but not clickable.
- [ ] New WattsInsight pages live under `(backend)/wattsinsight/` and appear in the backend sidebar next to Dashboard/Billing, reusing the existing authenticated session guard, not a new auth mechanism or a separate route group.
- [ ] `bun run db:check`, `bun run typecheck:all`, and all test suites pass with the new code included.
- [ ] No existing boilerplate file (auth config, billing, admin, i18n) needed unrelated changes beyond the explicitly listed integration points (`bootstrap.ts`, `app.ts`, `env.ts`, schema barrel, `backend-navbar-dashboard.ts`).

---

## Remaining Decisions Before Production Deployment

- Intervals.icu production OAuth redirect URI once a production `APP_URL`/`API_URL` are chosen.
- Whether periodic/background sync (via the existing `jobsRunner` pattern in `bootstrap.ts`) is needed, or on-demand sync remains sufficient.
- Whether WattsInsight needs an admin-side view (connection troubleshooting, sync failure visibility) in `apps/admin` — deferred out of Phase 0.

## Self-Review

- Spec coverage: Phase 0 requirements from `requirements.md` (Intervals.icu OAuth, disconnect, sync, calendar) are mapped to Tasks 1–7, with Tasks 8–9 covering quality gates and acceptance.
- Boilerplate reuse: no auth, billing, i18n, or admin functionality is rebuilt; the only touched shared files are the explicitly-listed integration points (`bootstrap.ts`, `app.ts`, `env.ts`, `schema/index.ts`, `config/application.ts`, `backend-navbar-dashboard.ts`), each a single, minimal addition.
- Isolation: `@wattsinsight/contracts` and `@wattsinsight/core` are new, independently-versioned package scopes so WattsInsight domain logic can be updated without touching `@platform/*`, and boilerplate updates to `@platform/*` packages don't require touching WattsInsight code. Frontend pages, by contrast, are confirmed to live inside the existing `(backend)` route group (not a separate one) so WattsInsight is visibly part of the authenticated app, reusing its sidebar and layout rather than duplicating them.
- Scope check: admin dashboard changes and background/periodic sync are intentionally excluded from Phase 0.
- Ambiguity check: remaining unknowns (production redirect URI, background sync necessity, admin visibility) are deferred, not blockers for local Phase 0 development.
