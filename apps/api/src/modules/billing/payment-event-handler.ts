import type { NormalizedPaymentEvent, PaymentEventHandler } from "@platform/payments-core";

import type { creditPackages as CreditPackagesList } from "../../config/billing";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled } from "../../lib/feature-guards";
import { isDodoSubscriptionWebhookEvent } from "./subscription-webhooks";

type CreditPackage = (typeof CreditPackagesList)[number];

const EXPECTED_PAYMENT_CURRENCY = "EUR";

export type PaymentEventHandlerDeps = {
  creditPackages: ReadonlyArray<CreditPackage>;
  billing: {
    getUserById: (userId: string) => Promise<{ id: string } | null>;
    processCreditPurchase: (
      userId: string,
      packageKey: string,
      paymentId: string,
      status: "completed" | "pending" | "failed",
      customerId: string | undefined,
      pricing: {
        priceExclVat: number;
        priceInclVat: number;
        vatAmount: number;
        currency: string;
      },
      snapshot: {
        provider: "dodo";
        customerId?: string;
      },
    ) => Promise<unknown>;
    processCreditRefund: (paymentId: string, refundId?: string) => Promise<unknown>;
    processCreditDisputeLoss: (paymentId: string, disputeId?: string, disputeStatus?: string) => Promise<unknown>;
  };
  subscriptions?: {
    handleDodoSubscriptionWebhook: (payload: unknown) => Promise<void>;
    recordSubscriptionPayment?: (input: {
      userId: string;
      planKey: string;
      paymentId: string;
      paymentStatus: "completed" | "pending" | "failed";
      dodoCustomerId?: string | null;
      dodoSubscriptionId?: string | null;
      pricing: {
        priceExclVat: number;
        priceInclVat: number;
        vatAmount: number;
        currency: string;
      };
    }) => Promise<unknown>;
  };
};

const DISPUTE_REVERSAL_EVENTS = new Set(["dispute.accepted", "dispute.lost"]);

function getWebhookDataPayload(raw: unknown) {
  return typeof raw === "object" && raw !== null && "data" in raw
    ? (raw as { data: unknown }).data
    : {};
}

/**
 * Build the payment event handler that turns a verified Dodo
 * `payment.succeeded` webhook into a credit-purchase mutation.
 *
 * SECURITY: this handler refuses any event that does not carry an authoritative
 * `metadata.userId` (bound at checkout-URL construction time). Without that
 * binding an attacker who knows a victim's customer email could replay or
 * forge a webhook and have credits applied to whatever account the email
 * resolves to. Mapping by `metadata.userId` makes the credited account a
 * direct function of the authenticated session that initiated the checkout.
 */
export function createPaymentEventHandler(deps: PaymentEventHandlerDeps): PaymentEventHandler {
  return async (event: NormalizedPaymentEvent) => {
    if (isDodoSubscriptionWebhookEvent(event.eventType)) {
      ensureSubscriptionBillingEnabled();
      await deps.subscriptions?.handleDodoSubscriptionWebhook({
        event_type: event.eventType,
        data: getWebhookDataPayload(event.raw),
      });
      return;
    }

    if (event.eventType === "refund.succeeded") {
      ensureCreditBillingEnabled();
      if (event.refundIsPartial) {
        throw new Error(`Refusing payment ${event.paymentId}: partial refunds require manual reconciliation.`);
      }

      await deps.billing.processCreditRefund(event.paymentId, event.refundId);
      return;
    }

    if (event.eventType.startsWith("dispute.")) {
      ensureCreditBillingEnabled();
      if (DISPUTE_REVERSAL_EVENTS.has(event.eventType)) {
        await deps.billing.processCreditDisputeLoss(event.paymentId, event.disputeId, event.disputeStatus);
      }

      return;
    }

    if (
      event.eventType !== "payment.succeeded" &&
      event.eventType !== "payment.processing" &&
      event.eventType !== "payment.failed"
    ) {
      return;
    }

    if (!event.productId) {
      throw new Error("Missing product id");
    }

    const metadataUserId =
      typeof event.metadata?.userId === "string" ? event.metadata.userId : undefined;

    if (!metadataUserId) {
      throw new Error(
        `Refusing payment ${event.paymentId}: metadata.userId missing. Checkout URLs must bind userId.`,
      );
    }

    if (event.metadata?.billingMode === "subscriptions") {
      ensureSubscriptionBillingEnabled();

      const planKey = typeof event.metadata.planKey === "string" ? event.metadata.planKey : undefined;
      if (!planKey) {
        throw new Error(`Refusing payment ${event.paymentId}: metadata.planKey missing.`);
      }

      if (!event.currency) {
        throw new Error(`Refusing payment ${event.paymentId}: currency missing.`);
      }

      if (event.currency !== EXPECTED_PAYMENT_CURRENCY) {
        throw new Error(`Refusing payment ${event.paymentId}: expected ${EXPECTED_PAYMENT_CURRENCY}, received ${event.currency}.`);
      }

      if (!Number.isFinite(event.totalAmount) || event.totalAmount === undefined || event.totalAmount <= 0) {
        throw new Error(`Refusing payment ${event.paymentId}: invalid total amount.`);
      }

      if (!Number.isFinite(event.taxAmount) || event.taxAmount === undefined || event.taxAmount < 0) {
        throw new Error(`Refusing payment ${event.paymentId}: invalid tax amount.`);
      }

      if (event.taxAmount > event.totalAmount) {
        throw new Error(`Refusing payment ${event.paymentId}: tax amount exceeds total amount.`);
      }

      const foundUser = await deps.billing.getUserById(metadataUserId);
      if (!foundUser) {
        throw new Error(
          `Refusing payment ${event.paymentId}: metadata.userId ${metadataUserId} did not resolve to a known user.`,
        );
      }

      const paymentStatus = event.eventType === "payment.succeeded"
        ? "completed"
        : event.eventType === "payment.processing"
          ? "pending"
          : "failed";

      await deps.subscriptions?.recordSubscriptionPayment?.({
        userId: foundUser.id,
        planKey,
        paymentId: event.paymentId,
        paymentStatus,
        dodoCustomerId: event.customerId ?? null,
        dodoSubscriptionId: event.metadata.subscriptionId,
        pricing: {
          priceExclVat: event.totalAmount - event.taxAmount,
          priceInclVat: event.totalAmount,
          vatAmount: event.taxAmount,
          currency: event.currency,
        },
      });
      return;
    }

    ensureCreditBillingEnabled();

    const foundUser = await deps.billing.getUserById(metadataUserId);

    if (!foundUser) {
      throw new Error(
        `Refusing payment ${event.paymentId}: metadata.userId ${metadataUserId} did not resolve to a known user.`,
      );
    }

    const matchedPackage = deps.creditPackages.find((item) => item.productId === event.productId);
    if (!matchedPackage) {
      throw new Error(`Unknown product id: ${event.productId}`);
    }

    if (!event.currency) {
      throw new Error(`Refusing payment ${event.paymentId}: currency missing.`);
    }

    if (event.currency !== EXPECTED_PAYMENT_CURRENCY) {
      throw new Error(`Refusing payment ${event.paymentId}: expected ${EXPECTED_PAYMENT_CURRENCY}, received ${event.currency}.`);
    }

    if (!Number.isFinite(event.totalAmount) || event.totalAmount === undefined || event.totalAmount <= 0) {
      throw new Error(`Refusing payment ${event.paymentId}: invalid total amount.`);
    }

    if (event.totalAmount !== matchedPackage.price) {
      throw new Error(
        `Refusing payment ${event.paymentId}: expected amount ${matchedPackage.price}, received ${event.totalAmount}.`,
      );
    }

    if (!Number.isFinite(event.taxAmount) || event.taxAmount === undefined || event.taxAmount < 0) {
      throw new Error(`Refusing payment ${event.paymentId}: invalid tax amount.`);
    }

    if (event.taxAmount > event.totalAmount) {
      throw new Error(`Refusing payment ${event.paymentId}: tax amount exceeds total amount.`);
    }

    const paymentStatus = event.eventType === "payment.succeeded"
      ? "completed"
      : event.eventType === "payment.processing"
        ? "pending"
        : "failed";

    await deps.billing.processCreditPurchase(
      foundUser.id,
      matchedPackage.key,
      event.paymentId,
      paymentStatus,
      event.customerId,
      {
        priceExclVat: event.totalAmount - event.taxAmount,
        priceInclVat: event.totalAmount,
        vatAmount: event.taxAmount,
        currency: event.currency,
      },
      {
        provider: event.provider,
        customerId: event.customerId,
      },
    );
  };
}
