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

    await expect(service.canAccess("user-1", "intervals.read")).resolves.toEqual({
      allowed: true,
      reason: "credits_available",
    });
  });

  it("allows active subscription with valid period", async () => {
    const service = createEntitlementService({
      billingMode: () => "subscriptions",
      credits: { getCreditBalance: vi.fn() },
      subscriptions: {
        getUserSubscription: vi.fn(async () => ({
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 60_000),
        })),
      },
    });

    await expect(service.canAccess("user-1", "api.access")).resolves.toEqual({
      allowed: true,
      reason: "subscription_active",
    });
  });

  it("allows trialing subscription without period end", async () => {
    const service = createEntitlementService({
      billingMode: () => "subscriptions",
      credits: { getCreditBalance: vi.fn() },
      subscriptions: {
        getUserSubscription: vi.fn(async () => ({ status: "trialing", currentPeriodEnd: null })),
      },
    });

    await expect(service.canAccess("user-1", "intervals.write")).resolves.toEqual({
      allowed: true,
      reason: "subscription_active",
    });
  });

  it("denies canceled subscription", async () => {
    const service = createEntitlementService({
      billingMode: () => "subscriptions",
      credits: { getCreditBalance: vi.fn() },
      subscriptions: {
        getUserSubscription: vi.fn(async () => ({
          status: "canceled",
          currentPeriodEnd: new Date(Date.now() + 60_000),
        })),
      },
    });

    await expect(service.canAccess("user-1", "app.access")).resolves.toEqual({
      allowed: false,
      reason: "subscription_required",
    });
  });

  it("denies stale subscription", async () => {
    const service = createEntitlementService({
      billingMode: () => "subscriptions",
      credits: { getCreditBalance: vi.fn() },
      subscriptions: {
        getUserSubscription: vi.fn(async () => ({
          status: "active",
          currentPeriodEnd: new Date(Date.now() - 60_000),
        })),
      },
    });

    await expect(service.canAccess("user-1", "app.access")).resolves.toEqual({
      allowed: false,
      reason: "subscription_required",
    });
  });
});
