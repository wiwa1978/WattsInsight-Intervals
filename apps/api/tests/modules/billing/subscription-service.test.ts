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
      { planKey: "starter", status: "active" },
      { planKey: "pro", status: "trialing" },
      { planKey: "starter", status: "canceled" },
    ])).toEqual({
      monthlyRecurringRevenue: 68,
      annualRecurringRevenue: 816,
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
});
