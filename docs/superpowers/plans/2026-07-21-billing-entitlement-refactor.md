# Billing Entitlement Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize billing mode, entitlement, usage, and liability handling so paid access is enforced server-side and billing UI is easier to reason about.

**Architecture:** Add a shared billing capability model, then introduce API-side entitlement and usage services. Credits and subscriptions remain deploy-time modes, while paid access flows through one entitlement boundary. Credit refunds/chargebacks that exceed current balance create visible credit liabilities instead of silent negative balances.

**Tech Stack:** Hono API, Drizzle/PostgreSQL, Zod contracts, Better Auth, Dodo Payments, Next.js web/admin, Vitest.

---

## Task 1: Shared Billing Capability Model

**Files:**
- Create: `packages/contracts/src/ts/billing/capabilities.ts`
- Modify: `packages/contracts/src/ts/index.ts`
- Create: `packages/frontend-shared/src/billing-capabilities.ts`
- Modify: `packages/frontend-shared/src/index.ts`
- Test: `packages/frontend-shared/tests/billing-capabilities.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/frontend-shared/tests/billing-capabilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getBillingCapability } from "../src/billing-capabilities";

describe("getBillingCapability", () => {
  it("returns disabled capability when config is missing", () => {
    expect(getBillingCapability(undefined)).toEqual({
      enabled: false,
      mode: "disabled",
      userBillingVisible: false,
      adminBillingVisible: false,
      creditsVisible: false,
      subscriptionsVisible: false,
      vouchersVisible: false,
      discountsVisible: false,
    });
  });

  it("returns credits capability", () => {
    expect(getBillingCapability({
      billing: { enabled: true, mode: "credits", creditSurfacesEnabled: true, subscriptionSurfacesEnabled: false },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toMatchObject({
      enabled: true,
      mode: "credits",
      userBillingVisible: true,
      adminBillingVisible: true,
      creditsVisible: true,
      subscriptionsVisible: false,
      vouchersVisible: true,
      discountsVisible: true,
    });
  });

  it("returns subscriptions capability", () => {
    expect(getBillingCapability({
      billing: { enabled: true, mode: "subscriptions", creditSurfacesEnabled: false, subscriptionSurfacesEnabled: true },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toMatchObject({
      mode: "subscriptions",
      creditsVisible: false,
      subscriptionsVisible: true,
      vouchersVisible: false,
      discountsVisible: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun run --cwd packages/frontend-shared test tests/billing-capabilities.test.ts
```

Expected: fail because `billing-capabilities` does not exist.

- [ ] **Step 3: Implement shared capability model**

Create `packages/contracts/src/ts/billing/capabilities.ts`:

```ts
export type BillingMode = "credits" | "subscriptions" | "hybrid" | "disabled";

export type BillingCapabilityInput = {
  billing: {
    enabled: boolean;
    mode: "credits" | "subscriptions";
    creditSurfacesEnabled: boolean;
    subscriptionSurfacesEnabled: boolean;
  };
  features: {
    vouchers: boolean;
    discounts: boolean;
    notifications: boolean;
  };
};

export type BillingCapability = {
  enabled: boolean;
  mode: BillingMode;
  userBillingVisible: boolean;
  adminBillingVisible: boolean;
  creditsVisible: boolean;
  subscriptionsVisible: boolean;
  vouchersVisible: boolean;
  discountsVisible: boolean;
};

export function getBillingCapability(config: BillingCapabilityInput | null | undefined): BillingCapability {
  if (!config?.billing.enabled) {
    return {
      enabled: false,
      mode: "disabled",
      userBillingVisible: false,
      adminBillingVisible: false,
      creditsVisible: false,
      subscriptionsVisible: false,
      vouchersVisible: false,
      discountsVisible: false,
    };
  }

  const creditsVisible = config.billing.creditSurfacesEnabled;
  const subscriptionsVisible = config.billing.subscriptionSurfacesEnabled;

  return {
    enabled: true,
    mode: creditsVisible && subscriptionsVisible ? "hybrid" : config.billing.mode,
    userBillingVisible: creditsVisible || subscriptionsVisible,
    adminBillingVisible: true,
    creditsVisible,
    subscriptionsVisible,
    vouchersVisible: creditsVisible && config.features.vouchers,
    discountsVisible: config.features.discounts,
  };
}
```

Create `packages/frontend-shared/src/billing-capabilities.ts`:

```ts
export { getBillingCapability } from "@platform/contracts/ts";
export type { BillingCapability, BillingCapabilityInput, BillingMode } from "@platform/contracts/ts";
```

Update `packages/contracts/src/ts/index.ts`:

```ts
export * from "./billing/capabilities";
```

Update `packages/frontend-shared/src/index.ts`:

```ts
export * from "./billing-capabilities";
```

- [ ] **Step 4: Verify**

Run:

```bash
bun run --cwd packages/frontend-shared test tests/billing-capabilities.test.ts
bun run typecheck:packages
```

Expected: pass.

---

## Task 2: API Entitlement Service

**Files:**
- Create: `apps/api/src/modules/billing/entitlements.ts`
- Create: `apps/api/tests/modules/billing/entitlements.test.ts`
- Modify: `apps/api/src/bootstrap.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/modules/billing/entitlements.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createEntitlementService } from "../../../src/modules/billing/entitlements";

describe("createEntitlementService", () => {
  it("denies access without credits in credits mode", async () => {
    const service = createEntitlementService({
      billingMode: () => "credits",
      credits: { getCreditBalance: vi.fn(async () => ({ balance: 0 })) },
      subscriptions: { getUserSubscription: vi.fn() },
    });

    await expect(service.canAccess("user-1", "app.access")).resolves.toEqual({
      allowed: false,
      reason: "credits_required",
    });
  });

  it("allows access with credits in credits mode", async () => {
    const service = createEntitlementService({
      billingMode: () => "credits",
      credits: { getCreditBalance: vi.fn(async () => ({ balance: 10 })) },
      subscriptions: { getUserSubscription: vi.fn() },
    });

    await expect(service.canAccess("user-1", "app.access")).resolves.toEqual({
      allowed: true,
      reason: "credits_available",
    });
  });

  it("allows active subscription with valid period", async () => {
    const service = createEntitlementService({
      billingMode: () => "subscriptions",
      credits: { getCreditBalance: vi.fn() },
      subscriptions: {
        getUserSubscription: vi.fn(async () => ({ status: "active", currentPeriodEnd: new Date(Date.now() + 60_000) })),
      },
    });

    await expect(service.canAccess("user-1", "app.access")).resolves.toEqual({
      allowed: true,
      reason: "subscription_active",
    });
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
bun run --cwd apps/api test tests/modules/billing/entitlements.test.ts
```

Expected: fail because service does not exist.

- [ ] **Step 3: Implement service**

Create `apps/api/src/modules/billing/entitlements.ts`:

```ts
export type EntitlementKey = "app.access" | "intervals.read" | "intervals.write" | "api.access";

type AccessDecision = {
  allowed: boolean;
  reason: string;
};

export function createEntitlementService(deps: {
  billingMode: () => "credits" | "subscriptions";
  credits: {
    getCreditBalance(userId: string): Promise<{ balance: number | string }>;
  };
  subscriptions: {
    getUserSubscription(userId: string): Promise<{ status: string; currentPeriodEnd: Date | string | null } | null>;
  };
}) {
  async function canAccess(userId: string, _featureKey: EntitlementKey): Promise<AccessDecision> {
    if (deps.billingMode() === "credits") {
      const balance = await deps.credits.getCreditBalance(userId);
      const amount = Number(balance.balance);
      return amount > 0
        ? { allowed: true, reason: "credits_available" }
        : { allowed: false, reason: "credits_required" };
    }

    const subscription = await deps.subscriptions.getUserSubscription(userId);
    const statusOk = subscription?.status === "active" || subscription?.status === "trialing";
    const periodOk = !subscription?.currentPeriodEnd || new Date(subscription.currentPeriodEnd) >= new Date();

    return statusOk && periodOk
      ? { allowed: true, reason: "subscription_active" }
      : { allowed: false, reason: "subscription_required" };
  }

  return { canAccess };
}
```

- [ ] **Step 4: Wire in bootstrap**

Modify `apps/api/src/bootstrap.ts`:

```ts
import { createEntitlementService } from "./modules/billing/entitlements";
```

After `subscriptionService` exists:

```ts
const entitlementService = createEntitlementService({
  billingMode: getBillingMode,
  credits: billingService,
  subscriptions: subscriptionService,
});
```

Add to export:

```ts
entitlementService,
```

- [ ] **Step 5: Verify**

```bash
bun run --cwd apps/api test tests/modules/billing/entitlements.test.ts
bun run typecheck:api
```

Expected: pass.

---

## Task 3: Credit Liability Ledger

**Files:**
- Modify: `packages/platform-db/src/schema/billing.ts`
- Create migration with `bun run db:generate -- --name credit_liabilities`
- Create: `apps/api/src/modules/billing/credit-liabilities.ts`
- Create: `apps/api/tests/modules/billing/credit-liabilities.test.ts`
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `packages/contracts/src/wire/billing/responses.ts`

- [ ] **Step 1: Add schema**

Add to `packages/platform-db/src/schema/billing.ts`:

```ts
export const creditLiabilities = pgTable(
  "credit_liabilities",
  {
    id,
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    remainingAmount: decimal("remaining_amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").$type<"refund" | "chargeback" | "dispute" | "manual">().notNull(),
    status: text("status").$type<"open" | "settled" | "waived">().default("open").notNull(),
    sourcePaymentId: text("source_payment_id"),
    sourceRefundId: text("source_refund_id"),
    sourceDisputeId: text("source_dispute_id"),
    metadata: jsonb("metadata"),
    createdAt,
    updatedAt,
    settledAt: timestamp("settled_at", { withTimezone: true }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
  },
  (table) => [
    index("credit_liabilities_user_status_idx").on(table.userId, table.status),
    check("credit_liabilities_amount_positive", sql`${table.amount} > 0 AND ${table.remainingAmount} >= 0`),
    check("credit_liabilities_status_valid", sql`${table.status} IN ('open', 'settled', 'waived')`),
  ],
);
```

- [ ] **Step 2: Generate migration**

```bash
bun run db:generate -- --name credit_liabilities
```

Review generated SQL. It must only add `credit_liabilities` and its indexes/checks.

- [ ] **Step 3: Write service tests**

Create `apps/api/tests/modules/billing/credit-liabilities.test.ts` with tests:

```ts
it("creates open liability for missing credits")
it("settles liability from future credit purchase before increasing usable balance")
it("waives liability and records waived status")
```

- [ ] **Step 4: Implement service**

Create `apps/api/src/modules/billing/credit-liabilities.ts` with:

```ts
export function createCreditLiabilityService(deps: { db: any }) {
  async function create(input: {
    userId: string;
    amount: number;
    reason: "refund" | "chargeback" | "dispute" | "manual";
    sourcePaymentId?: string | null;
    sourceRefundId?: string | null;
    sourceDisputeId?: string | null;
    metadata?: unknown;
  }) {
    // insert open liability with remainingAmount = amount
  }

  async function applyIncomingCredits(userId: string, credits: number) {
    // settle open liabilities oldest-first and return usableCredits
  }

  async function listOpenForUser(userId: string) {
    // return open liabilities
  }

  async function waive(id: string, adminUserId: string) {
    // mark waived and set waivedAt
  }

  return { create, applyIncomingCredits, listOpenForUser, waive };
}
```

- [ ] **Step 5: Integrate into credit purchase and refund flows**

Modify `apps/api/src/modules/billing/service.ts`:

- on credit grant, call `creditLiabilities.applyIncomingCredits(userId, credits)` before increasing usable balance.
- on refund/chargeback reversal, if current balance is insufficient, set balance to zero and create a liability for the shortfall.

- [ ] **Step 6: Admin visibility**

Modify admin user detail endpoint in `apps/api/src/routes/admin.ts` to include:

```ts
creditLiabilities: await bootstrap.creditLiabilityService.listOpenForUser(userId)
```

Add admin UI to show:

```text
Credit liability: -42 credits
Reason
Source payment/refund/dispute
Status
Created at
```

- [ ] **Step 7: Verify**

```bash
bun run --cwd apps/api test tests/modules/billing/credit-liabilities.test.ts
bun run --cwd apps/api test tests/modules/billing/service.test.ts
bun run db:check
bun run typecheck:all
```

Expected: pass.

---

## Task 4: Server-Owned Credit Usage

**Files:**
- Create: `apps/api/src/modules/billing/usage.ts`
- Create: `apps/api/tests/modules/billing/usage.test.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `packages/contracts/src/wire/billing/requests.ts`

- [ ] **Step 1: Change request schema**

```ts
export const consumeFeatureUsageRequestSchema = z.object({
  featureKey: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

- [ ] **Step 2: Tests**

Create `usage.test.ts`:

```ts
it("calculates amount from server catalog")
it("rejects unknown feature key")
it("rejects usage outside credits mode")
it("preserves idempotency")
```

- [ ] **Step 3: Implement usage service**

Use `creditBillingConfig.features` to calculate amount.

- [ ] **Step 4: Wire `/me/credits/consume`**

Route should no longer read `amount` from request body.

- [ ] **Step 5: Verify**

```bash
bun run --cwd apps/api test tests/modules/billing/usage.test.ts
bun run typecheck:all
```

Expected: pass.

---

## Task 5: Billing UI Capability Refactor

**Files:**
- Modify: `apps/web/src/config/backend-navbar-dashboard.ts`
- Modify: `apps/web/src/app/[locale]/(backend)/billing/page.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx`
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx`
- Test: `apps/web/tests/config/navigation.test.ts`
- Test: `apps/admin/tests/config/backend-navbar-admin.test.ts`

- [ ] Replace raw billing flag checks with `getBillingCapability()`.
- [ ] Replace `return null` billing pages with an explicit unavailable state.
- [ ] Keep admin billing shell/tabs visible when billing is enabled.
- [ ] Hide vouchers when `!capability.vouchersVisible`.
- [ ] Hide discounts when `!capability.discountsVisible`.
- [ ] Verify:

```bash
bun run --cwd apps/web test tests/config/navigation.test.ts
bun run --cwd apps/admin test tests/config/backend-navbar-admin.test.ts
bun run typecheck:all
```

---

## Task 6: Safer Refund And Dispute Routing

**Files:**
- Modify: `apps/api/src/modules/billing/payment-event-handler.ts`
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/modules/billing/subscription-service.ts`
- Test: `apps/api/tests/modules/billing/payment-event-handler.test.ts`

- [ ] Add lookup methods:

```ts
findCreditPurchaseByProviderPayment(provider: string, paymentId: string)
findSubscriptionPaymentByProviderPayment(provider: string, paymentId: string)
```

- [ ] Route refund/dispute events by local payment kind, not by current billing mode.
- [ ] If credit reversal exceeds balance, create credit liability.
- [ ] If subscription payment is refunded/disputed, mark subscription payment refunded/disputed and revoke or block entitlement.
- [ ] Verify tests.

---

## Task 7: Final Verification

- [ ] Run:

```bash
bun run test:ci
```

Expected:

```text
bun audit: no vulnerabilities
db:check: OK
API tests: pass
Web tests: pass
Admin tests: pass
Frontend shared tests: pass
Web build: pass
Admin build: pass
```

---

## Self-Review Notes

- The plan intentionally does not implement full provider-neutral canonical billing tables in this wave.
- Credit liability is explicitly required and admin-visible.
- Entitlement service is introduced before UI cleanup so paid access has a server-side boundary first.
- Server-owned credit usage removes the most direct client-tampering risk.
