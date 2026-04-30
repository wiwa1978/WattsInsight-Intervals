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
      env: {
        DODO_PAYMENTS_API_KEY: "api-key",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      },
    });

    await expect(service.downloadSubscriptionInvoice("u1", "pay_sub_1")).resolves.toEqual({
      success: true,
      invoiceUrl: "https://invoices.test/subscription.pdf",
    });
  });
});
