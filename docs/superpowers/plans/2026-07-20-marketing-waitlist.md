# Marketing Site and Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch a polished Astro marketing site and privacy policy at `wattsinsight.icu`, backed by an isolated Cloudflare Worker/D1 double-opt-in waitlist that sends confirmation mail through Resend.

**Architecture:** `apps/marketing` remains a statically generated Astro site and talks only to a new `apps/waitlist-api` Cloudflare Worker. The Worker owns waitlist validation, D1 persistence, confirmation tokens, and Resend calls; it has no dependency on the unfinished Fastify API or local Postgres database.

**Tech Stack:** Astro 7, Tailwind CSS 3, TypeScript, Cloudflare Workers, D1, Wrangler, Resend HTTP API, Vitest, Node test runner

---

## File Map

### Waitlist Worker

- `apps/waitlist-api/package.json`: Worker scripts and dependencies.
- `apps/waitlist-api/tsconfig.json`: Worker TypeScript settings.
- `apps/waitlist-api/wrangler.jsonc`: Worker, D1, routes, observability, and environment bindings.
- `apps/waitlist-api/migrations/0001_create_waitlist.sql`: Waitlist schema and indexes.
- `apps/waitlist-api/src/types.ts`: Environment, record, and service interfaces.
- `apps/waitlist-api/src/validation.ts`: Request parsing and normalization.
- `apps/waitlist-api/src/tokens.ts`: Confirmation token generation and keyed hashing.
- `apps/waitlist-api/src/repository.ts`: D1 waitlist persistence only.
- `apps/waitlist-api/src/email.ts`: Resend HTTP transport and confirmation markup.
- `apps/waitlist-api/src/app.ts`: Route dispatch, CORS, orchestration, and safe responses.
- `apps/waitlist-api/src/index.ts`: Cloudflare Worker entry point.
- `apps/waitlist-api/test/*.test.ts`: Unit tests with in-memory service doubles.

### Marketing Site

- `apps/marketing/src/layouts/SiteLayout.astro`: Shared metadata, navigation, and footer.
- `apps/marketing/src/components/WaitlistForm.astro`: Accessible progressively enhanced waitlist form.
- `apps/marketing/src/components/TrainingLoadGraphic.astro`: Signature SVG.
- `apps/marketing/src/components/ProductPipeline.astro`: Pull/Understand/Plan/Talk sequence.
- `apps/marketing/src/components/ProductExamples.astro`: Calendar, coach, and adaptive-plan examples.
- `apps/marketing/src/pages/index.astro`: Landing-page composition.
- `apps/marketing/src/pages/privacy.astro`: Accurate launch-stage privacy policy.
- `apps/marketing/src/pages/waitlist/confirmed.astro`: Confirmation result page.
- `apps/marketing/src/styles/global.css`: DM Sans theme, tweakcn/shadcn tokens, responsive and reduced-motion rules.
- `apps/marketing/test/*.test.mjs`: Source-level content and accessibility contract tests.

### Repository Documentation

- `.env.example`: Public waitlist API URL and documented secret names only.
- `README.md`: Local development overview.
- `docs/deployment/cloudflare-marketing.md`: Step-by-step Pages, Worker, D1, DNS, and Resend deployment.

## Task 1: Scaffold The Isolated Cloudflare Worker

**Files:**
- Create: `apps/waitlist-api/package.json`
- Create: `apps/waitlist-api/tsconfig.json`
- Create: `apps/waitlist-api/wrangler.jsonc`
- Create: `apps/waitlist-api/src/types.ts`
- Create: `apps/waitlist-api/src/index.ts`
- Create: `apps/waitlist-api/src/app.ts`
- Create: `apps/waitlist-api/test/health.test.ts`

- [ ] **Step 1: Write the failing health endpoint test**

```ts
// apps/waitlist-api/test/health.test.ts
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("waitlist worker", () => {
  it("returns a minimal health response", async () => {
    const response = await createApp().fetch(
      new Request("https://waitlist-api.wattsinsight.icu/health"),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("does not expose unknown routes", async () => {
    const response = await createApp().fetch(
      new Request("https://waitlist-api.wattsinsight.icu/api/v1/activities"),
      {} as never,
    );

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Add Worker package configuration and run the failing test**

```json
// apps/waitlist-api/package.json
{
  "name": "waitlist-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir dist",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260720.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "wrangler": "^4.26.0"
  }
}
```

```json
// apps/waitlist-api/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types", "vitest/globals"]
  },
  "include": ["src", "test"]
}
```

Run: `pnpm install && pnpm --filter waitlist-api test`

Expected: FAIL because `../src/app` does not exist.

- [ ] **Step 3: Implement the minimal Worker shell**

```ts
// apps/waitlist-api/src/types.ts
export type Env = {
  DB: D1Database;
  APP_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  RESEND_API_KEY: string;
  CONFIRMATION_SECRET: string;
};
```

```ts
// apps/waitlist-api/src/app.ts
import type { Env } from "./types";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createApp() {
  return {
    async fetch(request: Request, _env: Env): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/health") {
        return json({ status: "ok" });
      }
      return json({ error: "Not found" }, 404);
    },
    async scheduled(_controller: ScheduledController, _env: Env): Promise<void> {},
  };
}
```

```ts
// apps/waitlist-api/src/index.ts
import { createApp } from "./app";

export default createApp();
```

```jsonc
// apps/waitlist-api/wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "wattsinsight-waitlist-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-20",
  "workers_dev": true,
  "observability": { "enabled": true },
  "vars": {
    "APP_ORIGIN": "https://wattsinsight.icu",
    "ALLOWED_ORIGINS": "https://wattsinsight.icu,https://www.wattsinsight.icu"
  }
}
```

The D1 binding is deliberately added after `wrangler d1 create` returns the real identifier in Task 10. Unit tests use injected repository doubles until then.

- [ ] **Step 4: Verify the Worker shell**

Run: `pnpm --filter waitlist-api test && pnpm --filter waitlist-api typecheck && pnpm --filter waitlist-api build`

Expected: health tests PASS, TypeScript exits 0, and Wrangler reports a successful dry run.

- [ ] **Step 5: Commit the Worker shell**

```bash
git add pnpm-lock.yaml apps/waitlist-api
git commit -m "feat: scaffold isolated waitlist worker"
```

## Task 2: Add D1 Schema And Waitlist Repository

**Files:**
- Create: `apps/waitlist-api/migrations/0001_create_waitlist.sql`
- Modify: `apps/waitlist-api/src/types.ts`
- Create: `apps/waitlist-api/src/repository.ts`
- Create: `apps/waitlist-api/test/repository.test.ts`

- [ ] **Step 1: Write failing repository tests with a D1 statement double**

```ts
// apps/waitlist-api/test/repository.test.ts
import { describe, expect, it, vi } from "vitest";
import { createWaitlistRepository } from "../src/repository";

describe("waitlist repository", () => {
  it("finds a record by normalized email using a bound parameter", async () => {
    const first = vi.fn().mockResolvedValue({ id: "entry-1", normalized_email: "athlete@example.com" });
    const bind = vi.fn(() => ({ first }));
    const prepare = vi.fn(() => ({ bind }));
    const repository = createWaitlistRepository({ prepare } as never);

    const result = await repository.findByEmail("athlete@example.com");

    expect(bind).toHaveBeenCalledWith("athlete@example.com");
    expect(result?.id).toBe("entry-1");
  });

  it("stores token hashes rather than raw confirmation tokens", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn(() => ({ run }));
    const repository = createWaitlistRepository({ prepare: () => ({ bind }) } as never);

    await repository.createPending({
      id: "entry-1",
      email: "Athlete@example.com",
      normalizedEmail: "athlete@example.com",
      consentedAt: "2026-07-20T12:00:00.000Z",
      policyVersion: "2026-07-20",
      tokenHash: "hashed-token",
      tokenExpiresAt: "2026-07-21T12:00:00.000Z",
    });

    expect(bind.mock.calls.flat()).toContain("hashed-token");
    expect(bind.mock.calls.flat()).not.toContain("raw-token");
  });
});
```

- [ ] **Step 2: Run the repository test to verify failure**

Run: `pnpm --filter waitlist-api test repository`

Expected: FAIL because `src/repository.ts` does not exist.

- [ ] **Step 3: Add the D1 migration**

```sql
-- apps/waitlist-api/migrations/0001_create_waitlist.sql
CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')) DEFAULT 'pending',
  policy_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  confirmation_token_hash TEXT,
  confirmation_token_expires_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX waitlist_entries_normalized_email_idx
  ON waitlist_entries(normalized_email);

CREATE INDEX waitlist_entries_token_hash_idx
  ON waitlist_entries(confirmation_token_hash);

CREATE INDEX waitlist_entries_pending_expiry_idx
  ON waitlist_entries(status, confirmation_token_expires_at);
```

- [ ] **Step 4: Implement the focused repository**

```ts
// additions to apps/waitlist-api/src/types.ts
export type WaitlistRecord = {
  id: string;
  email: string;
  normalized_email: string;
  status: "pending" | "confirmed";
  policy_version: string;
  consented_at: string;
  confirmation_token_hash: string | null;
  confirmation_token_expires_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PendingEntry = {
  id: string;
  email: string;
  normalizedEmail: string;
  policyVersion: string;
  consentedAt: string;
  tokenHash: string;
  tokenExpiresAt: string;
};
```

```ts
// apps/waitlist-api/src/repository.ts
import type { PendingEntry, WaitlistRecord } from "./types";

export function createWaitlistRepository(db: D1Database) {
  return {
    findByEmail(normalizedEmail: string) {
      return db.prepare("SELECT * FROM waitlist_entries WHERE normalized_email = ?1")
        .bind(normalizedEmail).first<WaitlistRecord>();
    },
    findByTokenHash(tokenHash: string) {
      return db.prepare("SELECT * FROM waitlist_entries WHERE confirmation_token_hash = ?1")
        .bind(tokenHash).first<WaitlistRecord>();
    },
    createPending(entry: PendingEntry) {
      return db.prepare(`INSERT INTO waitlist_entries
        (id, email, normalized_email, status, policy_version, consented_at,
         confirmation_token_hash, confirmation_token_expires_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?5, ?5)`)
        .bind(entry.id, entry.email, entry.normalizedEmail, entry.policyVersion,
          entry.consentedAt, entry.tokenHash, entry.tokenExpiresAt).run();
    },
    refreshPending(id: string, email: string, tokenHash: string, tokenExpiresAt: string, now: string) {
      return db.prepare(`UPDATE waitlist_entries SET email = ?2,
        confirmation_token_hash = ?3, confirmation_token_expires_at = ?4,
        updated_at = ?5 WHERE id = ?1 AND status = 'pending'`)
        .bind(id, email, tokenHash, tokenExpiresAt, now).run();
    },
    confirm(id: string, now: string) {
      return db.prepare(`UPDATE waitlist_entries SET status = 'confirmed', confirmed_at = ?2,
        confirmation_token_hash = NULL, confirmation_token_expires_at = NULL,
        updated_at = ?2 WHERE id = ?1 AND status = 'pending'`)
        .bind(id, now).run();
    },
    deletePendingBefore(cutoff: string) {
      return db.prepare("DELETE FROM waitlist_entries WHERE status = 'pending' AND created_at < ?1")
        .bind(cutoff).run();
    },
  };
}
```

- [ ] **Step 5: Verify and commit the repository**

Run: `pnpm --filter waitlist-api test repository && pnpm --filter waitlist-api typecheck`

Expected: repository tests PASS and TypeScript exits 0.

```bash
git add apps/waitlist-api
git commit -m "feat: add waitlist d1 repository"
```

## Task 3: Add Validation And Confirmation Tokens

**Files:**
- Create: `apps/waitlist-api/src/validation.ts`
- Create: `apps/waitlist-api/src/tokens.ts`
- Create: `apps/waitlist-api/test/validation.test.ts`
- Create: `apps/waitlist-api/test/tokens.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
// apps/waitlist-api/test/validation.test.ts
import { describe, expect, it } from "vitest";
import { parseSignup } from "../src/validation";

describe("waitlist validation", () => {
  it("normalizes a valid consenting signup", () => {
    expect(parseSignup({ email: " Athlete@Example.COM ", consent: true, company: "" })).toEqual({
      email: "Athlete@Example.COM",
      normalizedEmail: "athlete@example.com",
      consent: true,
      isBot: false,
    });
  });

  it.each([
    [{ email: "not-an-email", consent: true, company: "" }, "email"],
    [{ email: "athlete@example.com", consent: false, company: "" }, "consent"],
  ])("rejects invalid signup %#", (input, field) => {
    expect(() => parseSignup(input)).toThrow(field);
  });

  it("marks a filled honeypot as a bot", () => {
    expect(parseSignup({ email: "bot@example.com", consent: true, company: "crawler" }).isBot).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing token tests**

```ts
// apps/waitlist-api/test/tokens.test.ts
import { describe, expect, it } from "vitest";
import { createConfirmationToken, hashConfirmationToken } from "../src/tokens";

describe("confirmation tokens", () => {
  it("creates URL-safe random tokens", () => {
    expect(createConfirmationToken()).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("hashes deterministically with a secret and never returns the token", async () => {
    const first = await hashConfirmationToken("raw-token", "a-32-character-minimum-secret-value");
    const second = await hashConfirmationToken("raw-token", "a-32-character-minimum-secret-value");
    expect(first).toBe(second);
    expect(first).not.toContain("raw-token");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter waitlist-api test validation tokens`

Expected: FAIL because both source modules are missing.

- [ ] **Step 4: Implement validation and token utilities**

```ts
// apps/waitlist-api/src/validation.ts
export type SignupInput = {
  email: string;
  normalizedEmail: string;
  consent: true;
  isBot: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSignup(value: unknown): SignupInput {
  if (!value || typeof value !== "object") throw new Error("email: Invalid request");
  const input = value as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email.length > 254 || !EMAIL.test(email)) throw new Error("email: Enter a valid email address");
  if (input.consent !== true) throw new Error("consent: Consent is required");
  return {
    email,
    normalizedEmail: email.toLowerCase(),
    consent: true,
    isBot: typeof input.company === "string" && input.company.trim().length > 0,
  };
}
```

```ts
// apps/waitlist-api/src/tokens.ts
function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createConfirmationToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashConfirmationToken(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(signature));
}
```

- [ ] **Step 5: Verify and commit validation/token behavior**

Run: `pnpm --filter waitlist-api test validation tokens && pnpm --filter waitlist-api typecheck`

Expected: all validation and token tests PASS.

```bash
git add apps/waitlist-api
git commit -m "feat: validate waitlist signups and tokens"
```

## Task 4: Add Resend Confirmation Transport

**Files:**
- Create: `apps/waitlist-api/src/email.ts`
- Create: `apps/waitlist-api/test/email.test.ts`

- [ ] **Step 1: Write a failing Resend transport test**

```ts
// apps/waitlist-api/test/email.test.ts
import { describe, expect, it, vi } from "vitest";
import { sendConfirmationEmail } from "../src/email";

describe("confirmation email", () => {
  it("sends a branded confirmation link without exposing secrets", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "mail-1" }), { status: 200 }));
    await sendConfirmationEmail({
      fetcher,
      apiKey: "resend-secret",
      email: "athlete@example.com",
      confirmationUrl: "https://waitlist-api.wattsinsight.icu/waitlist/confirm?token=public-token",
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer resend-secret");
    expect(JSON.parse(init.body).from).toBe("WattsInsight <support@wattsinsight.icu>");
    expect(JSON.parse(init.body).html).toContain("public-token");
    expect(JSON.parse(init.body).html).not.toContain("resend-secret");
  });

  it("throws a safe error when Resend rejects the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("provider details", { status: 500 }));
    await expect(sendConfirmationEmail({
      fetcher, apiKey: "secret", email: "athlete@example.com", confirmationUrl: "https://example.com",
    })).rejects.toThrow("Confirmation email could not be sent");
  });
});
```

- [ ] **Step 2: Run the email test to verify failure**

Run: `pnpm --filter waitlist-api test email`

Expected: FAIL because `src/email.ts` does not exist.

- [ ] **Step 3: Implement the Resend HTTP transport**

```ts
// apps/waitlist-api/src/email.ts
type ConfirmationEmail = {
  fetcher: typeof fetch;
  apiKey: string;
  email: string;
  confirmationUrl: string;
};

export async function sendConfirmationEmail(input: ConfirmationEmail) {
  const response = await input.fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "WattsInsight <support@wattsinsight.icu>",
      to: [input.email],
      subject: "Confirm your WattsInsight early access",
      text: `Confirm your email to join the WattsInsight early-access list: ${input.confirmationUrl}\n\nThis link expires in 24 hours.`,
      html: `<div style="font-family:Arial,sans-serif;color:#1B1F23;line-height:1.6">
        <h1>Confirm your early access</h1>
        <p>Confirm your email to hear when WattsInsight launches and receive your launch discount.</p>
        <p><a href="${input.confirmationUrl}" style="background:#2C4A3E;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Confirm email</a></p>
        <p>This link expires in 24 hours. If you did not request this, ignore this message.</p>
      </div>`,
    }),
  });
  if (!response.ok) throw new Error("Confirmation email could not be sent");
}
```

- [ ] **Step 4: Verify and commit the mail transport**

Run: `pnpm --filter waitlist-api test email && pnpm --filter waitlist-api typecheck`

Expected: email tests PASS and TypeScript exits 0.

```bash
git add apps/waitlist-api
git commit -m "feat: send waitlist confirmation email"
```

## Task 5: Implement Signup And Confirmation Routes

**Files:**
- Modify: `apps/waitlist-api/src/types.ts`
- Modify: `apps/waitlist-api/src/app.ts`
- Create: `apps/waitlist-api/test/signup.test.ts`
- Create: `apps/waitlist-api/test/confirmation.test.ts`

- [ ] **Step 1: Write failing signup route tests**

```ts
// apps/waitlist-api/test/signup.test.ts
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

const env = {
  APP_ORIGIN: "https://wattsinsight.icu",
  ALLOWED_ORIGINS: "https://wattsinsight.icu,http://localhost:4321",
  RESEND_API_KEY: "test-key",
  CONFIRMATION_SECRET: "test-secret-that-is-at-least-32-chars",
  DB: {} as D1Database,
};

describe("POST /waitlist", () => {
  it("creates a pending signup and returns a generic response", async () => {
    const repository = { findByEmail: vi.fn().mockResolvedValue(null), createPending: vi.fn(), refreshPending: vi.fn() };
    const sendEmail = vi.fn();
    const response = await createApp({ repository: repository as never, sendEmail }).fetch(
      new Request("https://api.test/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://wattsinsight.icu" },
        body: JSON.stringify({ email: "athlete@example.com", consent: true, company: "" }),
      }), env,
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(repository.createPending).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(response.headers.get("access-control-allow-origin")).toBe("https://wattsinsight.icu");
  });

  it("rejects a foreign origin", async () => {
    const response = await createApp().fetch(new Request("https://api.test/waitlist", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "athlete@example.com", consent: true }),
    }), env);
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Write failing confirmation route tests**

```ts
// apps/waitlist-api/test/confirmation.test.ts
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

describe("GET /waitlist/confirm", () => {
  it("confirms an active token and redirects to the marketing result page", async () => {
    const repository = {
      findByTokenHash: vi.fn().mockResolvedValue({
        id: "entry-1", status: "pending", confirmation_token_expires_at: "2099-01-01T00:00:00.000Z",
      }),
      confirm: vi.fn(),
    };
    const response = await createApp({ repository: repository as never }).fetch(
      new Request("https://api.test/waitlist/confirm?token=raw-token"),
      { APP_ORIGIN: "https://wattsinsight.icu", CONFIRMATION_SECRET: "test-secret-that-is-at-least-32-chars" } as never,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://wattsinsight.icu/waitlist/confirmed?result=success");
    expect(repository.confirm).toHaveBeenCalledWith("entry-1", expect.any(String));
  });

  it("redirects invalid tokens without exposing details", async () => {
    const repository = { findByTokenHash: vi.fn().mockResolvedValue(null), confirm: vi.fn() };
    const response = await createApp({ repository: repository as never }).fetch(
      new Request("https://api.test/waitlist/confirm?token=invalid"),
      { APP_ORIGIN: "https://wattsinsight.icu", CONFIRMATION_SECRET: "test-secret-that-is-at-least-32-chars" } as never,
    );
    expect(response.headers.get("location")).toContain("result=invalid");
    expect(repository.confirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run route tests to verify failure**

Run: `pnpm --filter waitlist-api test signup confirmation`

Expected: FAIL because `createApp` does not accept dependency overrides or expose waitlist routes.

- [ ] **Step 4: Implement route orchestration and safe CORS**

Replace `apps/waitlist-api/src/app.ts` with an implementation using these interfaces and route behaviors:

```ts
import { sendConfirmationEmail } from "./email";
import { createWaitlistRepository } from "./repository";
import { createConfirmationToken, hashConfirmationToken } from "./tokens";
import type { Env } from "./types";
import { parseSignup } from "./validation";

type Dependencies = {
  repository?: ReturnType<typeof createWaitlistRepository>;
  sendEmail?: typeof sendConfirmationEmail;
  now?: () => Date;
  randomId?: () => string;
};

const POLICY_VERSION = "2026-07-20";
const DAY_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const PENDING_RETENTION_MS = 30 * DAY_MS;

function responseHeaders(origin?: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  };
}

function json(data: unknown, status = 200, origin?: string) {
  return Response.json(data, { status, headers: responseHeaders(origin) });
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin) ? origin : null;
}

export function createApp(overrides: Dependencies = {}) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok" });

      if (request.method === "POST" && url.pathname === "/waitlist") {
        const origin = allowedOrigin(request, env);
        if (origin === null) return json({ error: "Origin not allowed" }, 403);
        if (!request.headers.get("content-type")?.startsWith("application/json")) {
          return json({ error: "Expected JSON" }, 415, origin);
        }
        if (Number(request.headers.get("content-length") ?? 0) > 4096) {
          return json({ error: "Request too large" }, 413, origin);
        }

        try {
          const input = parseSignup(await request.json());
          if (input.isBot) return json({ accepted: true }, 202, origin);
          const repository = overrides.repository ?? createWaitlistRepository(env.DB);
          const existing = await repository.findByEmail(input.normalizedEmail);
          if (existing?.status === "confirmed") return json({ accepted: true }, 202, origin);

          const now = (overrides.now ?? (() => new Date()))();
          if (existing?.updated_at && now.getTime() - new Date(existing.updated_at).getTime() < RESEND_COOLDOWN_MS) {
            return json({ accepted: true }, 202, origin);
          }
          const token = createConfirmationToken();
          const tokenHash = await hashConfirmationToken(token, env.CONFIRMATION_SECRET);
          const expiresAt = new Date(now.getTime() + DAY_MS).toISOString();
          if (existing) {
            await repository.refreshPending(existing.id, input.email, tokenHash, expiresAt, now.toISOString());
          } else {
            await repository.createPending({
              id: (overrides.randomId ?? crypto.randomUUID)(), email: input.email,
              normalizedEmail: input.normalizedEmail, policyVersion: POLICY_VERSION,
              consentedAt: now.toISOString(), tokenHash, tokenExpiresAt: expiresAt,
            });
          }
          const confirmationUrl = new URL("/waitlist/confirm", request.url);
          confirmationUrl.searchParams.set("token", token);
          await (overrides.sendEmail ?? sendConfirmationEmail)({
            fetcher: fetch, apiKey: env.RESEND_API_KEY, email: input.email,
            confirmationUrl: confirmationUrl.toString(),
          });
          return json({ accepted: true }, 202, origin);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.startsWith("email:") || message.startsWith("consent:")) {
            const [field, fieldMessage] = message.split(": ", 2);
            return json({ error: fieldMessage, field }, 400, origin);
          }
          return json({ error: "Unable to join right now. Please try again." }, 503, origin);
        }
      }

      if (request.method === "GET" && url.pathname === "/waitlist/confirm") {
        const destination = new URL("/waitlist/confirmed", env.APP_ORIGIN);
        const token = url.searchParams.get("token");
        if (!token) {
          destination.searchParams.set("result", "invalid");
          return Response.redirect(destination, 302);
        }
        const repository = overrides.repository ?? createWaitlistRepository(env.DB);
        const tokenHash = await hashConfirmationToken(token, env.CONFIRMATION_SECRET);
        const entry = await repository.findByTokenHash(tokenHash);
        const now = (overrides.now ?? (() => new Date()))();
        if (!entry || entry.status !== "pending" || !entry.confirmation_token_expires_at ||
          new Date(entry.confirmation_token_expires_at) <= now) {
          destination.searchParams.set("result", entry ? "expired" : "invalid");
          return Response.redirect(destination, 302);
        }
        await repository.confirm(entry.id, now.toISOString());
        destination.searchParams.set("result", "success");
        return Response.redirect(destination, 302);
      }

      return json({ error: "Not found" }, 404);
    },
    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
      const repository = overrides.repository ?? createWaitlistRepository(env.DB);
      const now = (overrides.now ?? (() => new Date()))();
      const cutoff = new Date(now.getTime() - PENDING_RETENTION_MS).toISOString();
      await repository.deletePendingBefore(cutoff);
    },
  };
}
```

- [ ] **Step 5: Add remaining route cases and verify**

Extend tests with cases for missing consent, invalid email, honeypot, confirmed duplicate, pending duplicate inside the five-minute resend cooldown, pending duplicate after the cooldown, oversized request, unsupported content type, expired token, and Resend failure. Add a scheduled-handler test that fixes the clock at `2026-08-20T00:00:00.000Z`, invokes `scheduled`, and expects `deletePendingBefore("2026-07-21T00:00:00.000Z")`. Each HTTP test must assert the status and that no sensitive token/provider detail appears in the response.

Run: `pnpm --filter waitlist-api test && pnpm --filter waitlist-api typecheck && pnpm --filter waitlist-api build`

Expected: all Worker tests PASS and dry-run build exits 0.

- [ ] **Step 6: Commit complete Worker behavior**

```bash
git add apps/waitlist-api
git commit -m "feat: implement double opt-in waitlist api"
```

## Task 6: Build The Shared Marketing Theme And Layout

**Files:**
- Modify: `apps/marketing/src/styles/global.css`
- Create: `apps/marketing/src/layouts/SiteLayout.astro`
- Create: `apps/marketing/test/layout.test.mjs`

- [ ] **Step 1: Write the failing layout contract test**

```js
// apps/marketing/test/layout.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const layout = await readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8').catch(() => '');
const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');

test('shared layout exposes navigation, privacy, support, and login links', () => {
  assert.match(layout, /WattsInsight/);
  assert.match(layout, /\/privacy/);
  assert.match(layout, /support@wattsinsight\.icu/);
  assert.match(layout, /loginUrl/);
});

test('theme uses approved semantic tokens and DM Sans', () => {
  for (const token of ['--background', '--foreground', '--primary', '--accent', '--border', '--card', '--ring']) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /DM Sans/);
  assert.match(css, /#F7F5F0/i);
  assert.doesNotMatch(css, /color-scheme:\s*dark/);
});
```

- [ ] **Step 2: Run the marketing test to verify failure**

Run: `pnpm --filter marketing test`

Expected: FAIL because `SiteLayout.astro` is missing and the old dark theme lacks approved tokens.

- [ ] **Step 3: Implement the tweakcn-compatible token system**

Replace `apps/marketing/src/styles/global.css` with Tailwind layers plus these base tokens and rules:

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: #F7F5F0;
    --foreground: #1B1F23;
    --card: #FFFFFF;
    --card-foreground: #1B1F23;
    --primary: #2C4A3E;
    --primary-foreground: #FFFFFF;
    --secondary: #EEEAE2;
    --secondary-foreground: #1B1F23;
    --muted: #EDE9E1;
    --muted-foreground: #656A66;
    --accent: #E4572E;
    --accent-foreground: #FFFFFF;
    --border: #C9C2B4;
    --input: #9F998D;
    --ring: #2C4A3E;
    --radius: 0.5rem;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; min-width: 320px; background: var(--background); color: var(--foreground); font-family: 'DM Sans', sans-serif; }
  a { color: inherit; }
  :focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  }
}

@layer components {
  .site-width { width: min(1180px, calc(100% - 2rem)); margin-inline: auto; }
  .eyebrow { font: 500 0.72rem/1.2 'IBM Plex Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); }
  .button { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; border-radius: var(--radius); padding: .7rem 1rem; font-weight: 700; text-decoration: none; }
  .button-primary { border: 1px solid var(--primary); background: var(--primary); color: var(--primary-foreground); }
  .button-primary:hover { border-color: var(--accent); background: var(--accent); }
  .card { border: 1px solid var(--border); border-radius: calc(var(--radius) + .125rem); background: var(--card); }
}
```

- [ ] **Step 4: Implement the shared layout**

Create `SiteLayout.astro` with typed `title` and `description` props, canonical metadata, a header containing Product, How it works, and Log in, and a footer containing Privacy and `support@wattsinsight.icu`. Resolve login with `const loginUrl = new URL('/login', import.meta.env.WEB_BASE_URL ?? 'http://localhost:5173')`. Use semantic `header`, `nav`, `main`, and `footer` elements and a mobile-safe wrapping layout.

- [ ] **Step 5: Verify and commit the shared visual foundation**

Run: `pnpm --filter marketing test && pnpm --filter marketing typecheck`

Expected: layout/theme tests PASS and Astro check exits 0.

```bash
git add apps/marketing
git commit -m "feat: add marketing visual system"
```

## Task 7: Build The Landing Page And Product Visuals

**Files:**
- Create: `apps/marketing/src/components/TrainingLoadGraphic.astro`
- Create: `apps/marketing/src/components/ProductPipeline.astro`
- Create: `apps/marketing/src/components/ProductExamples.astro`
- Modify: `apps/marketing/src/pages/index.astro`
- Modify: `apps/marketing/test/homepage.test.mjs`

- [ ] **Step 1: Replace homepage tests with the approved content contract**

Add assertions that source files contain:

```js
assert.match(homepage, /Turn your training data into a plan you can trust/i);
assert.match(homepage, /launch discount/i);
assert.match(pipeline, /Pull/);
assert.match(pipeline, /Understand/);
assert.match(pipeline, /Plan/);
assert.match(pipeline, /Talk/);
assert.ok((pipeline.match(/Coming soon/g) ?? []).length >= 3);
assert.match(graphic, /prefers-reduced-motion|signature-line/);
assert.match(examples, /training calendar/i);
assert.match(examples, /Coming soon/i);
```

- [ ] **Step 2: Run homepage tests to verify failure**

Run: `pnpm --filter marketing test homepage`

Expected: FAIL because the old three-card homepage lacks the approved structure.

- [ ] **Step 3: Implement the signature graphic and pipeline**

Create `TrainingLoadGraphic.astro` as an accessible Card with title “Training load”, sample value `482`, a decorative SVG path with class `signature-line`, a vertical today rule, and a Split-colored point. Define the path animation in component CSS and disable it under `prefers-reduced-motion`.

Create `ProductPipeline.astro` from this data and render an ordered four-column list:

```ts
const steps = [
  { title: 'Pull', copy: 'Your completed activities arrive from Intervals.icu in one clear calendar.', available: true },
  { title: 'Understand', copy: 'Training load and trends turn individual sessions into useful context.', available: false },
  { title: 'Plan', copy: 'Build a plan grounded in what you have actually done, not a static template.', available: false },
  { title: 'Talk', copy: 'Ask a direct question, adjust the week, and understand the recommendation.', available: false },
];
```

- [ ] **Step 4: Implement concrete product examples**

Create `ProductExamples.astro` with three restrained sections:

- Current calendar: a seven-column week preview with “Endurance ride · 1h 24m” and “Easy run · 42m”.
- Coming soon coach exchange: “My legs still feel heavy. Should I do today’s intervals?” and the concrete response “Move the interval session to Thursday. Keep today to 40 minutes easy; your last three days are 18% above your normal load.”
- Coming soon adaptive plan: “Tuesday: 5 × 5 min threshold” changes to “Tuesday: 40 min recovery; Thursday: 5 × 5 min threshold”.

Mark both future examples with visible text, not color alone.

- [ ] **Step 5: Compose the landing page**

Replace `index.astro` with `SiteLayout`, a two-column hero, `TrainingLoadGraphic`, integration strip, `ProductPipeline`, `ProductExamples`, and a final waitlist section. At this stage both waitlist actions are accessible links to `#waitlist`; Task 8 replaces them with the functional form. The integration strip must label Garmin, Strava, Wahoo, and Zwift as “future ecosystem”, not active connections.

- [ ] **Step 6: Verify and commit the page structure**

Run: `pnpm --filter marketing test && pnpm --filter marketing typecheck && pnpm --filter marketing build`

Expected: tests PASS, Astro check exits 0, and static build succeeds.

```bash
git add apps/marketing
git commit -m "feat: redesign marketing landing page"
```

## Task 8: Add The Progressive Waitlist Form And Result Page

**Files:**
- Create: `apps/marketing/src/components/WaitlistForm.astro`
- Create: `apps/marketing/src/pages/waitlist/confirmed.astro`
- Create: `apps/marketing/test/waitlist-form.test.mjs`
- Modify: `apps/marketing/src/pages/index.astro`

- [ ] **Step 1: Write failing form accessibility tests**

```js
// apps/marketing/test/waitlist-form.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const form = await readFile(new URL('../src/components/WaitlistForm.astro', import.meta.url), 'utf8').catch(() => '');
const result = await readFile(new URL('../src/pages/waitlist/confirmed.astro', import.meta.url), 'utf8').catch(() => '');

test('waitlist form has email, explicit consent, honeypot, privacy link, and live status', () => {
  assert.match(form, /type="email"/);
  assert.match(form, /name="consent"/);
  assert.match(form, /name="company"/);
  assert.match(form, /\/privacy/);
  assert.match(form, /aria-live="polite"/);
  assert.match(form, /PUBLIC_WAITLIST_API_URL/);
});

test('confirmation page handles success, invalid, and expired results', () => {
  assert.match(result, /success/);
  assert.match(result, /invalid/);
  assert.match(result, /expired/);
});
```

- [ ] **Step 2: Run the form tests to verify failure**

Run: `pnpm --filter marketing test waitlist-form`

Expected: FAIL because form and result page are missing.

- [ ] **Step 3: Implement the waitlist form**

Create `WaitlistForm.astro` with:

```astro
---
interface Props { id: string; compact?: boolean; }
const { id, compact = false } = Astro.props;
const apiUrl = import.meta.env.PUBLIC_WAITLIST_API_URL ?? 'http://localhost:8787';
---
<form class:list={['waitlist-form', { compact }]} data-waitlist-form data-api-url={apiUrl} novalidate>
  <label for={`${id}-email`}>Email address</label>
  <div class="form-row">
    <input id={`${id}-email`} name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
    <button class="button button-primary" type="submit">Join waitlist <span aria-hidden="true">→</span></button>
  </div>
  <div class="honeypot" aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off" /></label></div>
  <label class="consent"><input name="consent" type="checkbox" required /> I agree to receive a confirmation email and launch news, including my early-access discount. See the <a href="/privacy">privacy policy</a>.</label>
  <p class="form-status" aria-live="polite"></p>
</form>
```

Add one module script that attaches to all `[data-waitlist-form]` elements, validates email/consent, posts JSON to `${apiUrl}/waitlist`, disables the submit button while pending, shows field-safe server errors, and replaces successful forms with “Check your inbox to confirm your place.” Do not insert server strings with `innerHTML`; use `textContent`.

- [ ] **Step 4: Implement the confirmation result page**

Read `Astro.url.searchParams.get('result')` and map only `success`, `expired`, and `invalid` to fixed local copy. Unknown values use the invalid state. The success state says the address is confirmed and the launch discount will be sent when WattsInsight opens. Error states link to `/#waitlist` to request a new confirmation.

- [ ] **Step 5: Insert forms and verify interaction contracts**

Render `WaitlistForm` in hero and final CTA with unique IDs. Add `id="waitlist"` to the final section.

Run: `pnpm --filter marketing test && pnpm --filter marketing typecheck && pnpm --filter marketing build`

Expected: all marketing tests PASS and build succeeds.

- [ ] **Step 6: Commit the waitlist UI**

```bash
git add apps/marketing
git commit -m "feat: add double opt-in waitlist form"
```

## Task 9: Publish The Privacy Policy

**Files:**
- Create: `apps/marketing/src/pages/privacy.astro`
- Create: `apps/marketing/test/privacy.test.mjs`

- [ ] **Step 1: Write the failing privacy contract test**

```js
// apps/marketing/test/privacy.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const policy = await readFile(new URL('../src/pages/privacy.astro', import.meta.url), 'utf8').catch(() => '');

test('privacy policy states the approved controller and launch-stage data flow', () => {
  for (const required of [
    /WattsInsight/, /support@wattsinsight\.icu/, /16/, /Cloudflare/, /Resend/,
    /Intervals\.icu/, /30 days/, /Belgian Data Protection Authority/,
    /withdraw.*consent/i, /not.*legal advice|legal review/i,
  ]) assert.match(policy, required);
});

test('privacy policy does not claim AI processing is currently active', () => {
  assert.match(policy, /not currently active|before these features launch/i);
});
```

- [ ] **Step 2: Run the privacy test to verify failure**

Run: `pnpm --filter marketing test privacy`

Expected: FAIL because `/privacy` does not exist.

- [ ] **Step 3: Implement the policy using approved facts**

Create `privacy.astro` with `SiteLayout`, effective date `20 July 2026`, a legal-review notice, and these headings:

1. Who we are
2. Information we collect
3. Why we process information
4. How we use information
5. Waitlist and email confirmation
6. Current service providers
7. Future analytics and AI features
8. Retention and deletion
9. International transfers
10. Cookies
11. Your GDPR rights
12. Children
13. Security
14. Policy changes
15. Contact

Use the exact commitments in the approved spec: controller WattsInsight; contact `support@wattsinsight.icu`; minimum age 16; Cloudflare and Resend as current waitlist processors; no active LLM/wellness processing; pending entries deleted after 30 days; account deletion completed within 30 days; Belgian DPA complaint right; and confirmed entries retained only until withdrawal or launch mailing completion absent separate consent.

- [ ] **Step 4: Verify and commit the privacy page**

Run: `pnpm --filter marketing test privacy && pnpm --filter marketing typecheck && pnpm --filter marketing build`

Expected: privacy tests PASS and static build succeeds.

```bash
git add apps/marketing
git commit -m "feat: publish privacy policy"
```

## Task 10: Document Local Development And Cloudflare Deployment

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/deployment/cloudflare-marketing.md`
- Modify: `apps/waitlist-api/wrangler.jsonc`

- [ ] **Step 1: Add safe environment examples**

Append to `.env.example`:

```env
PUBLIC_WAITLIST_API_URL=http://localhost:8787
# Worker secrets: set with `wrangler secret put`; never place real values here.
RESEND_API_KEY=replace-in-worker-secrets
CONFIRMATION_SECRET=replace-in-worker-secrets-with-at-least-32-random-characters
```

Do not copy the user's real local database credentials or any live API key into documentation.

- [ ] **Step 2: Document local startup**

Add a README section with exact commands:

```bash
pnpm install
pnpm --filter waitlist-api exec wrangler d1 migrations apply wattsinsight-waitlist --local
pnpm --filter waitlist-api dev
pnpm --filter marketing dev
```

Document local URLs `http://localhost:8787` and `http://localhost:4321`, and explain that local Resend sending requires a test API key supplied as a Wrangler secret or `.dev.vars` file that remains ignored.

- [ ] **Step 3: Write the production deployment runbook**

Create `docs/deployment/cloudflare-marketing.md` with these ordered commands and dashboard actions:

```bash
npx wrangler login
pnpm --filter waitlist-api exec wrangler d1 create wattsinsight-waitlist
# Copy the returned database_id into apps/waitlist-api/wrangler.jsonc.
pnpm --filter waitlist-api exec wrangler d1 migrations apply wattsinsight-waitlist --remote
node -e 'console.log(crypto.randomBytes(32).toString("base64url"))'
pnpm --filter waitlist-api exec wrangler secret put CONFIRMATION_SECRET
pnpm --filter waitlist-api exec wrangler secret put RESEND_API_KEY
pnpm --filter waitlist-api deploy
```

Then document:

- Add Worker custom domain `waitlist-api.wattsinsight.icu`.
- Update Worker route/host configuration and set production allowed origins.
- Verify `wattsinsight.icu` in Resend and add supplied DKIM/SPF plus a DMARC DNS record.
- Create Cloudflare Pages project from the monorepo with build command `pnpm --filter marketing build` and output `apps/marketing/dist`.
- Set Pages variable `PUBLIC_WAITLIST_API_URL=https://waitlist-api.wattsinsight.icu`.
- Attach `wattsinsight.icu`; redirect `www` to the apex.
- Configure Cloudflare rate limiting for `POST /waitlist` and `GET /waitlist/confirm`.
- Send a real confirmation test, inspect D1, test expiry/error pages, and verify no unfinished API endpoint exists on the Worker host.

- [ ] **Step 4: Add the production D1 binding after creation**

Run the documented `wrangler d1 create` command and add the returned identifier to `apps/waitlist-api/wrangler.jsonc` in this exact structure, substituting the actual UUID printed by Wrangler for `<returned-database-uuid>`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "wattsinsight-waitlist",
    "database_id": "<returned-database-uuid>",
    "migrations_dir": "migrations"
  }
],
"triggers": {
  "crons": ["17 3 * * *"]
}
```

The daily cron invokes the scheduled handler that removes pending entries older than 30 days. Never commit secret values.

- [ ] **Step 5: Verify docs and configuration**

Run: `pnpm --filter waitlist-api build && pnpm --filter marketing build`

Expected: both production builds succeed with no secret required at build time.

- [ ] **Step 6: Commit deployment documentation**

```bash
git add .env.example README.md docs/deployment/cloudflare-marketing.md apps/waitlist-api/wrangler.jsonc
git commit -m "docs: add marketing deployment runbook"
```

## Task 11: Perform End-To-End Verification

**Files:**
- Modify only files implicated by verification failures.

- [ ] **Step 1: Run the complete repository verification suite**

Run independently:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all Turbo tasks pass. If unrelated concurrent API work fails, record the exact unrelated failure and still run both scoped suites below.

- [ ] **Step 2: Run scoped verification with fresh output**

```bash
pnpm --filter waitlist-api test
pnpm --filter waitlist-api typecheck
pnpm --filter waitlist-api build
pnpm --filter marketing test
pnpm --filter marketing typecheck
pnpm --filter marketing build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify desktop and mobile in a browser**

Start `pnpm --filter marketing dev`, open the site, and inspect at 1440×900 and 390×844. Confirm:

- Navigation and hero do not overflow.
- DM Sans loads and the page uses the approved Paper/Ink/Pine/Split palette.
- Signature graphic animates once and remains static with reduced motion.
- All Coming soon labels are visible.
- Keyboard focus reaches navigation, both forms, privacy link, and footer.
- Form validation, pending, success, and simulated API error states are legible.
- `/privacy` and all confirmation result variants render correctly.

- [ ] **Step 4: Verify the deployed security boundary**

After Worker deployment, request:

```bash
curl -i https://waitlist-api.wattsinsight.icu/health
curl -i https://waitlist-api.wattsinsight.icu/api/v1/activities
curl -i -X POST https://waitlist-api.wattsinsight.icu/waitlist \
  -H 'Origin: https://not-wattsinsight.example' \
  -H 'Content-Type: application/json' \
  --data '{"email":"test@example.com","consent":true,"company":""}'
```

Expected: health is 200 with only `{"status":"ok"}`; product API route is 404; foreign origin is 403 and has no permissive CORS header.

- [ ] **Step 5: Verify real double opt-in**

Submit a controlled address from `https://wattsinsight.icu`, confirm receipt from `support@wattsinsight.icu`, open the confirmation link, and query D1 from Wrangler:

```bash
pnpm --filter waitlist-api exec wrangler d1 execute wattsinsight-waitlist --remote \
  --command "SELECT normalized_email, status, confirmation_token_hash, confirmed_at FROM waitlist_entries ORDER BY created_at DESC LIMIT 1"
```

Expected: status is `confirmed`, token hash is `NULL`, confirmation timestamp is set, and no raw confirmation token is stored.

- [ ] **Step 6: Review the final diff and commit only verification fixes**

Run: `git status --short && git diff --stat && git diff`

Confirm no `.dev.vars`, credentials, generated `dist`, or unrelated concurrent changes are staged. If verification required fixes, commit only those files:

```bash
git add <verified-fix-files>
git commit -m "fix: address marketing launch verification"
```
