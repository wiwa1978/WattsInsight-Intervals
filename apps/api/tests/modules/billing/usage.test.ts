import { describe, expect, it, vi } from "vitest";

import { creditBillingConfig } from "../../../src/config/billing";
import { createUsageService } from "../../../src/modules/billing/usage";

describe("createUsageService", () => {
  it("uses configured feature entries with server-owned costs", () => {
    expect(creditBillingConfig.features.aiGeneration.cost).toBe(1);
  });

  it("calculates amount from server catalog", async () => {
    const billingService = {
      consumeCredits: vi.fn(async () => ({
        transactionId: "tx-1",
        idempotencyKey: "idem-key-12345678",
        balanceBefore: "10.00",
        balanceAfter: "9.00",
        alreadyProcessed: false,
      })),
    };
    const service = createUsageService({
      billingMode: () => "credits",
      features: { aiGeneration: { cost: 1 } },
      billingService,
    });

    await expect(service.consumeFeatureUsage("user-1", {
      featureKey: "aiGeneration",
      idempotencyKey: "idem-key-12345678",
      description: "Generate report",
      metadata: { reportId: "report-1" },
    })).resolves.toMatchObject({
      transactionId: "tx-1",
      alreadyProcessed: false,
    });
    expect(billingService.consumeCredits).toHaveBeenCalledWith("user-1", {
      featureKey: "aiGeneration",
      amount: 1,
      idempotencyKey: "idem-key-12345678",
      description: "Generate report",
      metadata: { reportId: "report-1" },
    });
  });

  it("rejects unknown feature key", async () => {
    const billingService = { consumeCredits: vi.fn() };
    const service = createUsageService({
      billingMode: () => "credits",
      features: { aiGeneration: { cost: 1 } },
      billingService,
    });

    await expect(service.consumeFeatureUsage("user-1", {
      featureKey: "missingFeature",
      idempotencyKey: "idem-key-12345678",
    })).rejects.toThrow("Unknown billable feature: missingFeature");
    expect(billingService.consumeCredits).not.toHaveBeenCalled();
  });

  it("rejects usage outside credits mode", async () => {
    const billingService = { consumeCredits: vi.fn() };
    const service = createUsageService({
      billingMode: () => "subscriptions",
      features: { aiGeneration: { cost: 1 } },
      billingService,
    });

    await expect(service.consumeFeatureUsage("user-1", {
      featureKey: "aiGeneration",
      idempotencyKey: "idem-key-12345678",
    })).rejects.toThrow("Credit usage is only available in credits billing mode");
    expect(billingService.consumeCredits).not.toHaveBeenCalled();
  });

  it("preserves idempotency", async () => {
    const billingService = {
      consumeCredits: vi.fn(async () => ({
        transactionId: "tx-existing",
        idempotencyKey: "idem-key-12345678",
        balanceBefore: "10.00",
        balanceAfter: "9.00",
        alreadyProcessed: true,
      })),
    };
    const service = createUsageService({
      billingMode: () => "credits",
      features: { aiGeneration: { cost: 1 } },
      billingService,
    });

    const result = await service.consumeFeatureUsage("user-1", {
      featureKey: "aiGeneration",
      idempotencyKey: "idem-key-12345678",
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(billingService.consumeCredits).toHaveBeenCalledTimes(1);
    expect(billingService.consumeCredits).toHaveBeenCalledWith("user-1", expect.objectContaining({
      idempotencyKey: "idem-key-12345678",
      amount: 1,
    }));
  });
});
