import { describe, expect, it, vi } from "vitest";

import {
  calculateSubscriptionRecurringRevenue,
  hasActiveSubscriptionStatus,
  normalizeSubscriptionStatus,
  createSubscriptionService,
} from "../../../src/modules/billing/subscription-service";

describe("subscription service helpers", () => {
  it("normalizes provider subscription statuses", () => {
    expect(normalizeSubscriptionStatus("active")).toBe("active");
    expect(normalizeSubscriptionStatus("cancelled")).toBe("canceled");
    expect(normalizeSubscriptionStatus("failed")).toBe("past_due");
    expect(normalizeSubscriptionStatus("on_hold")).toBe("paused");
    expect(normalizeSubscriptionStatus("pending")).toBe("trialing");
  });

  it("detects active subscription statuses", () => {
    expect(hasActiveSubscriptionStatus("active")).toBe(true);
    expect(hasActiveSubscriptionStatus("trialing")).toBe(true);
    expect(hasActiveSubscriptionStatus("past_due")).toBe(false);
  });

  it("calculates recurring revenue from active subscriptions", () => {
    expect(calculateSubscriptionRecurringRevenue([
      { planKey: "Bronze", status: "active" },
      { planKey: "Silver", status: "trialing" },
      { planKey: "Bronze", status: "canceled" },
    ])).toEqual({
      monthlyRecurringRevenue: 35,
      annualRecurringRevenue: 420,
    });
  });

  it("downloads subscription invoices only for owner completed payments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ invoice_pdf: "https://invoices.test/subscription.pdf" }),
      }),
    );
    const service = createSubscriptionService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "sp_1", userId: "u1", paymentStatus: "completed" }]),
            }),
          }),
        }),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: true, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
        getInvoice: vi.fn(async () => ({ invoiceUrl: "https://invoices.test/subscription.pdf" })),
      },
    });

    await expect(service.downloadSubscriptionInvoice("u1", "pay_sub_1")).resolves.toEqual({
      success: true,
      invoiceUrl: "https://invoices.test/subscription.pdf",
    });
  });

  it("lists subscription plan distribution from local subscription rows", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { planKey: "starter", count: "2" },
      { planKey: "pro", count: "1" },
    ]);
    const from = vi.fn().mockReturnValue({ groupBy });
    const select = vi.fn().mockReturnValue({ from });
    const service = createSubscriptionService({ db: { select } as any });

    await expect(service.getPlanDistribution()).resolves.toEqual([
      { planKey: "starter", count: 2 },
      { planKey: "pro", count: 1 },
    ]);
  });

  it("lists recent subscription events from local event rows", async () => {
    const events = [
      {
        id: "evt_1",
        userId: "user_1",
        providerSubscriptionId: "sub_1",
        dodoSubscriptionId: "sub_1",
        eventType: "subscription.active",
        status: "active",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      },
    ];
    const limit = vi.fn().mockResolvedValue(events);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ orderBy });
    const select = vi.fn().mockReturnValue({ from });
    const service = createSubscriptionService({ db: { select } as any });

    await expect(service.listSubscriptionEvents(10)).resolves.toEqual(events);
    expect(limit).toHaveBeenCalledWith(10);
  });

  it("lists subscription payments with user details", async () => {
    const payments = [
      {
        id: "sp_1",
        userId: "user_1",
        planKey: "starter",
        paymentId: "pay_1",
        paymentStatus: "completed",
        priceInclVat: 1900,
        userEmail: "alice@example.com",
      },
    ];
    const paymentsOffset = vi.fn().mockResolvedValue(payments);
    const paymentsLimit = vi.fn().mockReturnValue({ offset: paymentsOffset });
    const paymentsOrderBy = vi.fn().mockReturnValue({ limit: paymentsLimit });
    const paymentsWhere = vi.fn().mockReturnValue({ orderBy: paymentsOrderBy });
    const paymentsInnerJoin = vi.fn().mockReturnValue({ where: paymentsWhere });
    const paymentsFrom = vi.fn().mockReturnValue({ innerJoin: paymentsInnerJoin });

    const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const countInnerJoin = vi.fn().mockReturnValue({ where: countWhere });
    const countFrom = vi.fn().mockReturnValue({ innerJoin: countInnerJoin });
    const select = vi.fn()
      .mockReturnValueOnce({ from: paymentsFrom })
      .mockReturnValueOnce({ from: countFrom });
    const service = createSubscriptionService({ db: { select } as any });

    await expect(service.listSubscriptionPayments(5, 10, "alice@example.com")).resolves.toEqual({
      payments,
      total: 1,
      hasMore: false,
    });
    expect(paymentsLimit).toHaveBeenCalledWith(5);
    expect(paymentsOffset).toHaveBeenCalledWith(10);
  });

  it("returns provider-neutral identifiers for subscription responses", async () => {
    const subscription = {
      id: "us_1",
      userId: "user_1",
      planKey: "starter",
      dodoCustomerId: "cus_1",
      dodoSubscriptionId: "sub_1",
      status: "active",
    };
    const service = createSubscriptionService({
      db: {
        query: {
          userSubscriptions: {
            findFirst: vi.fn().mockResolvedValue(subscription),
          },
        },
      } as any,
    });

    await expect(service.getUserSubscription("user_1")).resolves.toEqual({
      ...subscription,
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
    });
  });

  it("creates provider refunds and marks subscription payments refunded", async () => {
    const payment = {
      id: "sp_1",
      userId: "user_1",
      paymentProvider: "dodo",
      paymentId: "pay_1",
      paymentStatus: "completed",
      paymentSnapshot: { existing: true },
    };
    const updateReturning = vi.fn()
      .mockResolvedValueOnce([{ ...payment, paymentStatus: "pending" }])
      .mockResolvedValueOnce([{ ...payment, paymentStatus: "refunded" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const db = {
      transaction: vi.fn(async (callback) => callback({
        query: { subscriptionPayments: { findFirst: vi.fn().mockResolvedValue(payment) } },
        update,
      })),
      update,
    };
    const createRefund = vi.fn().mockResolvedValue({
      refundId: "ref_1",
      paymentId: "pay_1",
      status: "pending",
      amount: 1900,
      currency: "EUR",
    });
    const service = createSubscriptionService({
      db: db as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: true, finance: false },
        createCheckoutUrl: vi.fn(),
        createRefund,
      },
    });

    await expect(service.createSubscriptionRefund({
      paymentId: "pay_1",
      reason: "Customer request",
      actorUserId: "admin_1",
    })).resolves.toEqual(expect.objectContaining({
      refund: expect.objectContaining({ refundId: "ref_1" }),
      payment: expect.objectContaining({ paymentStatus: "refunded" }),
    }));
    expect(createRefund).toHaveBeenCalledWith({
      paymentId: "pay_1",
      reason: "Customer request",
      metadata: {
        initiated_by: "admin_api",
        actor_user_id: "admin_1",
        user_id: "user_1",
        local_subscription_payment_id: "sp_1",
      },
      idempotencyKey: "subscription-refund:dodo:pay_1",
    });
    expect(updateSet).toHaveBeenLastCalledWith(expect.objectContaining({
      paymentStatus: "refunded",
      refundStatus: "pending",
    }));
  });

  it("stores provider payment id when recording subscription payments", async () => {
    let insertedValues: Record<string, unknown> | undefined;
    const returning = vi.fn().mockResolvedValue([{ id: "sp_1", paymentId: "pay_1" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockImplementation((input) => {
      insertedValues = input;
      return { onConflictDoUpdate };
    });
    const service = createSubscriptionService({
      db: {
        transaction: vi.fn(async (callback) => callback({
          query: { subscriptionPayments: { findFirst: vi.fn().mockResolvedValue(null) } },
          insert: vi.fn().mockReturnValue({ values }),
        })),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
      },
    });

    await service.recordSubscriptionPayment({
      userId: "user_1",
      planKey: "Bronze",
      paymentId: "pay_1",
      paymentStatus: "completed",
      pricing: {
        priceExclVat: 1000,
        priceInclVat: 1210,
        vatAmount: 210,
        currency: "EUR",
      },
    });

    expect(insertedValues).toMatchObject({
      paymentProvider: "dodo",
      paymentId: "pay_1",
    });
  });

  it("finds subscription payments by provider payment id", async () => {
    const payment = { id: "sp_1", paymentProvider: "dodo", paymentId: "pay_1" };
    const findFirst = vi.fn().mockResolvedValue(payment);
    const service = createSubscriptionService({
      db: { query: { subscriptionPayments: { findFirst } } } as any,
    });

    await expect(service.findSubscriptionPaymentByProviderPayment("dodo", "pay_1")).resolves.toBe(payment);
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("marks subscription payments refunded from provider webhook", async () => {
    const payment = {
      id: "sp_1",
      userId: "user_1",
      paymentProvider: "dodo",
      paymentId: "pay_1",
      paymentStatus: "completed",
      paymentSnapshot: { existing: true },
    };
    const updatedPayment = { ...payment, paymentStatus: "refunded", refundStatus: "succeeded" };
    const findFirst = vi.fn().mockResolvedValue(payment);
    const updateReturning = vi.fn().mockResolvedValue([updatedPayment]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const service = createSubscriptionService({
      db: {
        query: { subscriptionPayments: { findFirst } },
        update,
      } as any,
    });

    await expect(service.recordSubscriptionRefund("dodo", "pay_1", "rfnd_1")).resolves.toBe(updatedPayment);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      paymentStatus: "refunded",
      refundStatus: "succeeded",
      paymentSnapshot: expect.objectContaining({
        existing: true,
        providerRefund: { refundId: "rfnd_1" },
      }),
    }));
  });

  it("marks subscription payments disputed from provider webhook", async () => {
    const payment = {
      id: "sp_1",
      userId: "user_1",
      paymentProvider: "dodo",
      paymentId: "pay_1",
      paymentStatus: "completed",
      paymentSnapshot: null,
    };
    const updatedPayment = { ...payment, paymentStatus: "failed", refundStatus: "dispute_lost" };
    const findFirst = vi.fn().mockResolvedValue(payment);
    const updateReturning = vi.fn().mockResolvedValue([updatedPayment]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const service = createSubscriptionService({
      db: {
        query: { subscriptionPayments: { findFirst } },
        update,
      } as any,
    });

    await expect(service.recordSubscriptionDisputeLoss("dodo", "pay_1", "disp_1", "dispute_lost")).resolves.toBe(updatedPayment);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      paymentStatus: "failed",
      refundStatus: "dispute_lost",
      errorCode: "dispute_lost",
      paymentSnapshot: {
        providerDispute: { disputeId: "disp_1", disputeStatus: "dispute_lost" },
      },
    }));
  });

  it("rolls subscription payment status back when provider refund creation fails", async () => {
    const payment = {
      id: "sp_1",
      userId: "user_1",
      paymentProvider: "dodo",
      paymentId: "pay_1",
      paymentStatus: "completed",
      paymentSnapshot: null,
    };
    const updateReturning = vi.fn().mockResolvedValueOnce([{ ...payment, paymentStatus: "pending" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const db = {
      transaction: vi.fn(async (callback) => callback({
        query: { subscriptionPayments: { findFirst: vi.fn().mockResolvedValue(payment) } },
        update,
      })),
      update,
    };
    const service = createSubscriptionService({
      db: db as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: true, finance: false },
        createCheckoutUrl: vi.fn(),
        createRefund: vi.fn().mockRejectedValue(new Error("provider failed")),
      },
    });

    await expect(service.createSubscriptionRefund({ paymentId: "pay_1" })).rejects.toThrow("provider failed");
    expect(updateSet).toHaveBeenLastCalledWith(expect.objectContaining({ paymentStatus: "completed" }));
  });

  it("summarizes subscription finance from local and provider rows", async () => {
    const from = vi.fn().mockResolvedValue([
      { paymentId: "pay_1", dodoSubscriptionId: "sub_1", paymentStatus: "completed", priceInclVat: 1900, currency: "EUR" },
      { paymentId: "pay_2", dodoSubscriptionId: "sub_2", paymentStatus: "refunded", priceInclVat: 900, currency: "EUR" },
      { paymentId: "pay_3", dodoSubscriptionId: "sub_3", paymentStatus: "failed", priceInclVat: 2900, currency: "EUR" },
      { paymentId: "pay_4", dodoSubscriptionId: "sub_4", paymentStatus: "pending", priceInclVat: 3900, currency: "EUR" },
    ]);
    const select = vi.fn().mockReturnValue({ from });
    const service = createSubscriptionService({
      db: { select } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: false, finance: true },
        createCheckoutUrl: vi.fn(),
        finance: {
          listPayments: vi.fn().mockResolvedValue({ items: [{ paymentId: "pay_1" }, { paymentId: "pay_provider_only" }] }),
          listSubscriptions: vi.fn().mockResolvedValue({ items: [{ subscriptionId: "sub_1" }, { subscriptionId: "sub_provider_only" }] }),
        },
      },
    });

    await expect(service.getSubscriptionFinanceSummary()).resolves.toEqual({
      currency: "EUR",
      grossRevenue: 19,
      refundedRevenue: 9,
      netRevenue: 10,
      totalPayments: 4,
      completedPayments: 1,
      refundedPayments: 1,
      failedPayments: 1,
      pendingPayments: 1,
      providerFinanceAvailable: true,
      providerPaymentsChecked: 2,
      providerSubscriptionsChecked: 2,
      unmatchedProviderPayments: 1,
      unmatchedProviderSubscriptions: 1,
    });
  });
});
