import { afterEach, describe, expect, it, vi } from "vitest";

import { applicationConfig } from "../../../src/config/application";
import { createPaymentEventHandler } from "../../../src/modules/billing/payment-event-handler";

const originalBillingMode = applicationConfig.billing.mode;

afterEach(() => {
  (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = originalBillingMode;
});

function createBillingDeps() {
  return {
    getUserById: vi.fn().mockResolvedValue({ id: "user-1" }),
    processCreditPurchase: vi.fn().mockResolvedValue({}),
    processCreditRefund: vi.fn().mockResolvedValue({}),
    processCreditDisputeLoss: vi.fn().mockResolvedValue({}),
  };
}

describe("payment event handler billing modes", () => {
  it("rejects credit payments when subscription mode is configured", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const handler = createPaymentEventHandler({
      creditPackages: [{ key: "bronze", credits: 100, price: 1000, productId: "pdt_1" }],
      billing,
    });

    await expect(handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      productId: "pdt_1",
      metadata: { userId: "user-1" },
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      raw: {},
    })).rejects.toThrow("Billing mode disabled: credits");
  });

  it("routes subscription events to the subscription webhook handler", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const handleDodoSubscriptionWebhook = vi.fn().mockResolvedValue(undefined);
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      subscriptions: { handleDodoSubscriptionWebhook },
    });

    await handler({
      provider: "dodo",
      eventType: "subscription.active",
      paymentId: "sub_1",
      raw: {
        data: {
          subscription_id: "sub_1",
          product_id: "pdt_subscription_starter",
          status: "active",
          metadata: { userId: "user-1", planKey: "starter" },
        },
      },
    });

    expect(handleDodoSubscriptionWebhook).toHaveBeenCalledWith({
      event_type: "subscription.active",
      data: {
        subscription_id: "sub_1",
        product_id: "pdt_subscription_starter",
        status: "active",
        metadata: { userId: "user-1", planKey: "starter" },
      },
    });
  });

  it("records subscription payments when subscription mode payment succeeds", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const recordSubscriptionPayment = vi.fn().mockResolvedValue({});
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      subscriptions: {
        handleDodoSubscriptionWebhook: vi.fn(),
        recordSubscriptionPayment,
      },
    });

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_sub_1",
      productId: "pdt_subscription_starter",
      metadata: { billingMode: "subscriptions", userId: "user-1", planKey: "starter", subscriptionId: "sub_1" },
      customerId: "cus_1",
      currency: "EUR",
      totalAmount: 1900,
      taxAmount: 190,
      raw: {},
    });

    expect(recordSubscriptionPayment).toHaveBeenCalledWith({
      userId: "user-1",
      planKey: "starter",
      paymentId: "pay_sub_1",
      paymentStatus: "completed",
      dodoCustomerId: "cus_1",
      dodoSubscriptionId: "sub_1",
      pricing: {
        priceExclVat: 1710,
        priceInclVat: 1900,
        vatAmount: 190,
        currency: "EUR",
      },
    });
    expect(billing.processCreditPurchase).not.toHaveBeenCalled();
  });
});
