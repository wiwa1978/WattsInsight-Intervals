# Billing Entitlement Refactor Design

## Goal

Simplify the billing implementation by centralizing billing mode, capability, checkout, usage, and entitlement decisions. The system should keep the current deploy-time choice between credits and subscriptions, while designing the internals so a future hybrid mode can be added without another rewrite.

The security goal is explicit: no user can access paid functionality unless the API has granted access through a server-side entitlement decision backed by credits, a valid subscription, a trial/admin grant, or an explicitly free feature.

## Current Problems

Billing currently works, but the logic is spread across API routes, billing services, subscription services, checkout handlers, frontend page branches, sidebar widgets, and admin dashboards. Credits and subscriptions are treated as separate systems rather than as two billing products under one billing core.

Key weak areas:

- `POST /me/credits/consume` accepts client-supplied `featureKey` and `amount`.
- No central `EntitlementService` exists for paid access decisions.
- Subscription access is not checked through one period-aware entitlement boundary.
- Refund and dispute handling is credit-biased and incomplete for subscriptions.
- If credits were already spent, refund/chargeback handling can conflict with non-negative balance constraints.
- Frontend/admin UI directly checks raw billing config flags in multiple places.
- Provider neutrality is partial; Dodo-specific fields still leak into schema/contracts/services.
- Admin UI does not clearly show credit debt/liability caused by refunds or chargebacks.

## Recommended Product Mode

Use deploy-time mode selection now:

- `credits`
- `subscriptions`
- `disabled`

Design the service boundaries so `hybrid` can be added later. Do not implement `hybrid` in this pass.

## Core Concepts

### Billing Capability

Billing capability is the normalized frontend/backend view of what billing surfaces are enabled.

```ts
type BillingCapability = {
  enabled: boolean;
  mode: "credits" | "subscriptions" | "hybrid" | "disabled";
  userBillingVisible: boolean;
  adminBillingVisible: boolean;
  creditsVisible: boolean;
  subscriptionsVisible: boolean;
  vouchersVisible: boolean;
  discountsVisible: boolean;
};
```

All web/admin navigation and billing pages should use this instead of scattered checks for `creditSurfacesEnabled` and `subscriptionSurfacesEnabled`.

### Entitlement

Entitlement is the server-side decision of whether a user can access a paid feature.

```ts
type EntitlementKey =
  | "app.access"
  | "intervals.read"
  | "intervals.write"
  | "api.access";

type EffectiveEntitlement = {
  key: EntitlementKey;
  active: boolean;
  source: "subscription" | "credits" | "admin" | "free";
  reason: string;
  validUntil?: string | null;
  remainingCredits?: number;
};
```

All paid API features must call the entitlement service. Frontend gates are UX only and must never be the security boundary.

### Server-Owned Usage

Credit usage must be server-owned. The client may provide `featureKey` and `idempotencyKey`, but the server computes the cost from a catalog.

The client must not provide the debit amount.

### Credit Liability

Credit liability records debt caused by refunds, chargebacks, or disputes after credits were already spent.

The system must not silently allow negative balances. Instead:

- If the user has enough credits, debit normally.
- If the user has insufficient credits, reduce balance to zero and create a liability for the missing amount.
- Future credit purchases settle open liabilities before increasing usable balance.
- Admins can inspect, settle, or waive liabilities.

Example:

```text
Current credits: 0
Credit liability: -42 credits
Reason: chargeback
Related payment: pay_123
Status: open
```

Future purchase example:

```text
Open liability: -42 credits
Purchased credits: 100
Liability settled: 42
Usable balance: 58
```

## Target Modules

```text
BillingModule
  BillingCapabilityService
  BillingCatalogService
  CheckoutService
  PaymentEventProcessor
  CreditLedgerService
  CreditLiabilityService
  SubscriptionStateMachine
  EntitlementService
  BillingReconciliationService
  ProviderAdapters
```

## API Direction

### Entitlement API

Add:

```text
GET /me/entitlements
```

Response:

```json
{
  "success": true,
  "data": {
    "entitlements": []
  }
}
```

### Credit Usage API

Replace the client-controlled amount with server-owned usage:

```json
{
  "featureKey": "intervals.write",
  "idempotencyKey": "unique-operation-id",
  "metadata": {}
}
```

The server calculates the cost.

### Checkout API

Move toward one discriminated checkout API:

```ts
createCheckoutSession({
  billingMode: "credits",
  packageKey,
  discountCode,
  address,
});

createCheckoutSession({
  billingMode: "subscriptions",
  planKey,
  discountCode,
  address,
});
```

## Database Direction

Add initially:

```text
credit_liabilities
```

Fields:

```text
id
user_id
amount
remaining_amount
reason
status
source_payment_id
source_refund_id
source_dispute_id
metadata
created_at
updated_at
settled_at
waived_at
```

Later canonical billing tables:

```text
billing_customers
billing_checkout_intents
billing_payments
billing_subscriptions
billing_provider_events
entitlement_definitions
plan_entitlements
user_entitlements
credit_ledger_entries
```

Do not attempt the full canonical rewrite in the first implementation wave.

## Frontend Direction

Use one shared billing capability helper everywhere.

Replace blank billing pages with explicit states:

- Billing disabled
- Credits mode active
- Subscriptions mode active
- Billing unavailable
- Manual reconciliation required

Admin surfaces must show credit liabilities in:

- Admin user detail
- Admin billing credits dashboard
- Admin operations/reconciliation area

## Security Invariants

- Paid access must be decided by the API, never by frontend state.
- Clients must never choose credit debit amount.
- Checkout metadata must bind user, billing mode, product, package/plan, and checkout reference.
- Webhook events must be idempotent by provider event id.
- Refund/dispute events must resolve the local payment first, then apply the correct product-specific behavior.
- Subscription entitlements must account for status and period validity.
- Credit liabilities must be visible to admins and audit logged.

## Implementation Scope

The first implementation wave should deliver:

1. Shared billing capability helper.
2. API entitlement service.
3. Server-owned credit usage.
4. Credit liability ledger and admin visibility.
5. UI capability cleanup.
6. Safer refund/dispute behavior.

Provider-neutral canonical billing tables are a later wave.

## Acceptance Criteria

- Users cannot access a paid feature without valid entitlement.
- Users cannot reduce credit cost by changing client payload.
- Refunds/chargebacks after credit spending create visible liabilities.
- New credit purchases settle liabilities before increasing usable balance.
- Admin can see exactly how many credits are owed and why.
- Billing UI uses one capability model.
- Existing `credits` and `subscriptions` modes still work.
- `bun run test:ci` passes.
