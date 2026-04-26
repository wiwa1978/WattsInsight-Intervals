import { describe, expect, it, vi } from "vitest";

import type { NormalizedPaymentEvent } from "@platform/payments-core";

import { buildDodoCheckoutUrl } from "../../src/lib/dodo-checkout";
import { createPaymentEventHandler } from "../../src/modules/billing/payment-event-handler";
import { creditPackages } from "../../src/config/billing";

describe("buildDodoCheckoutUrl", () => {
  const baseUrl = "https://test.checkout.dodopayments.com";
  const productId = "pdt_TEST";

  it("binds userId, packageKey, customer email, and redirect URLs", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "user-123",
        packageKey: "silver",
        customerEmail: "buyer@example.com",
        successUrl: "https://app.example.com/billing?success=true",
        cancelUrl: "https://app.example.com/billing?cancel=true",
      }),
    );

    expect(url.origin + url.pathname).toBe(`${baseUrl}/buy/${productId}`);
    expect(url.searchParams.get("metadata_userId")).toBe("user-123");
    expect(url.searchParams.get("metadata_packageKey")).toBe("silver");
    expect(url.searchParams.get("customer_email")).toBe("buyer@example.com");
    expect(url.searchParams.get("redirect_url")).toBe(
      "https://app.example.com/billing?success=true",
    );
    expect(url.searchParams.get("cancel_url")).toBe("https://app.example.com/billing?cancel=true");
  });

  it("omits customer_email when no email is provided", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "user-123",
        packageKey: "silver",
      }),
    );

    expect(url.searchParams.has("customer_email")).toBe(false);
    expect(url.searchParams.has("redirect_url")).toBe(false);
    expect(url.searchParams.has("cancel_url")).toBe(false);
    expect(url.searchParams.get("metadata_userId")).toBe("user-123");
  });

  it("URL-encodes userId values to prevent metadata smuggling", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "victim&metadata_userId=attacker",
        packageKey: "silver",
      }),
    );

    // searchParams.getAll returns only the values bound by *us* under the key,
    // so an attacker cannot inject a second metadata_userId via the value.
    expect(url.searchParams.getAll("metadata_userId")).toEqual([
      "victim&metadata_userId=attacker",
    ]);
  });
});

describe("createPaymentEventHandler", () => {
  const samplePackage = creditPackages[0];

  const validPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent => ({
    provider: "dodo",
    eventType: "payment.succeeded",
    paymentId: "pay_valid",
    productId: samplePackage.productId,
    metadata: { userId: "real-user-id" },
    currency: "EUR",
    totalAmount: samplePackage.price,
    taxAmount: 200,
    raw: {},
    ...overrides,
  });

  const validFailedPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent =>
    validPaymentEvent({
      eventType: "payment.failed",
      paymentId: "pay_failed",
      ...overrides,
    });

  const validProcessingPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent =>
    validPaymentEvent({
      eventType: "payment.processing",
      paymentId: "pay_processing",
      ...overrides,
    });

  function makeDeps(overrides?: {
    findUser?: (id: string) => Promise<{ id: string } | null>;
  }) {
    const processCreditPurchase = vi.fn(async () => ({ ok: true }));
    const processCreditRefund = vi.fn(async () => ({ ok: true }));
    const getUserById = vi.fn(
      overrides?.findUser ?? (async (id: string) => ({ id })),
    );
    return {
      processCreditPurchase,
      processCreditRefund,
      getUserById,
      handler: createPaymentEventHandler({
        creditPackages,
        billing: {
          getUserById,
          processCreditPurchase,
          processCreditRefund,
        },
      }),
    };
  }

  it("refuses payment.succeeded without metadata.userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_1",
        productId: samplePackage.productId,
        customerEmail: "victim@example.com",
        metadata: {},
        raw: {},
      }),
    ).rejects.toThrow(/metadata\.userId missing/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when metadata.userId does not resolve", async () => {
    const { handler, processCreditPurchase } = makeDeps({
      findUser: async () => null,
    });

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_2",
        productId: samplePackage.productId,
        metadata: { userId: "ghost-user" },
        raw: {},
      }),
    ).rejects.toThrow(/did not resolve to a known user/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("credits the userId from metadata, ignoring customerEmail entirely", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_3",
      productId: samplePackage.productId,
      // attacker-controlled email pointing at a different account
      customerEmail: "attacker@example.com",
      customerId: "cus_abc",
      metadata: { userId: "real-user-id" },
      currency: "EUR",
      totalAmount: samplePackage.price,
      taxAmount: 200,
      raw: {},
    });

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_3",
      "completed",
      "cus_abc",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
    );
  });

  it("refuses payment.succeeded without currency", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_currency", currency: undefined }))).rejects.toThrow(
      /currency missing/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded with unexpected currency", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_usd", currency: "USD" }))).rejects.toThrow(
      /expected EUR, received USD/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded without total amount", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_total", totalAmount: undefined }))).rejects.toThrow(
      /invalid total amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when amount does not match package price", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_wrong_amount", totalAmount: samplePackage.price - 1 }))).rejects.toThrow(
      /expected amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded without tax amount", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_tax", taxAmount: undefined }))).rejects.toThrow(
      /invalid tax amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when tax exceeds total", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_tax_gt_total", taxAmount: samplePackage.price + 1 }))).rejects.toThrow(
      /tax amount exceeds total amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("rejects unknown product ids even with valid userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_5",
        productId: "pdt_DOES_NOT_EXIST",
        metadata: { userId: "real-user-id" },
        raw: {},
      }),
    ).rejects.toThrow(/Unknown product id/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("records payment.failed without granting credits", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler(validFailedPaymentEvent({ paymentId: "pay_failed", customerId: "cus_failed" }));

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_failed",
      "failed",
      "cus_failed",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
    );
  });

  it("records payment.processing as pending without granting credits", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler(validProcessingPaymentEvent({ paymentId: "pay_processing", customerId: "cus_processing" }));

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_processing",
      "pending",
      "cus_processing",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
    );
  });

  it("refuses payment.failed without metadata.userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validFailedPaymentEvent({ metadata: {} }))).rejects.toThrow(/metadata\.userId missing/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("records full refunds by payment id", async () => {
    const { handler, processCreditPurchase, processCreditRefund, getUserById } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "refund.succeeded",
      paymentId: "pay_refunded",
      refundId: "rfnd_123",
      refundIsPartial: false,
      raw: {},
    });

    expect(processCreditRefund).toHaveBeenCalledWith("pay_refunded", "rfnd_123");
    expect(processCreditPurchase).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("rejects partial refunds pending manual reconciliation", async () => {
    const { handler, processCreditRefund } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "refund.succeeded",
        paymentId: "pay_partial_refund",
        refundId: "rfnd_partial",
        refundIsPartial: true,
        raw: {},
      }),
    ).rejects.toThrow(/partial refunds require manual reconciliation/);

    expect(processCreditRefund).not.toHaveBeenCalled();
  });
});
