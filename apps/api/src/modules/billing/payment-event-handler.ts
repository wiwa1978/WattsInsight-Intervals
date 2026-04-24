import type { NormalizedPaymentEvent, PaymentEventHandler } from "@platform/payments-core";

import type { creditPackages as CreditPackagesList } from "../../config/billing";

type CreditPackage = (typeof CreditPackagesList)[number];

export type PaymentEventHandlerDeps = {
  creditPackages: ReadonlyArray<CreditPackage>;
  billing: {
    getUserById: (userId: string) => Promise<{ id: string } | null>;
    processCreditPurchase: (
      userId: string,
      packageKey: string,
      paymentId: string,
      status: "completed",
      customerId: string | undefined,
      pricing: {
        priceExclVat: number;
        priceInclVat: number;
        vatAmount: number;
        currency: string;
      },
    ) => Promise<unknown>;
  };
};

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
    if (event.eventType !== "payment.succeeded") {
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

    await deps.billing.processCreditPurchase(
      foundUser.id,
      matchedPackage.key,
      event.paymentId,
      "completed",
      event.customerId,
      {
        priceExclVat: (event.totalAmount ?? 0) - (event.taxAmount ?? 0),
        priceInclVat: event.totalAmount ?? 0,
        vatAmount: event.taxAmount ?? 0,
        currency: event.currency ?? "EUR",
      },
    );
  };
}
