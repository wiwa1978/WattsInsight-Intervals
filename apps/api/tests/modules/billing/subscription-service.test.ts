import { describe, expect, it } from "vitest";

import {
  calculateSubscriptionRecurringRevenue,
  hasActiveSubscriptionStatus,
  normalizeSubscriptionStatus,
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
});
