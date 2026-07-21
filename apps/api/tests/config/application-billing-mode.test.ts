import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApplicationConfigForMode(mode: "credits" | "subscriptions") {
  vi.resetModules();
  process.env.BILLING_MODE = mode;

  return import("../../src/config/application");
}

describe("application billing mode", () => {
  afterEach(() => {
    delete process.env.BILLING_MODE;
  });

  it("reads credits mode from env", async () => {
    const { applicationConfig } = await loadApplicationConfigForMode("credits");

    expect(applicationConfig.billing.mode).toBe("credits");
  });

  it("reads subscriptions mode from env", async () => {
    const { applicationConfig } = await loadApplicationConfigForMode("subscriptions");

    expect(applicationConfig.billing.mode).toBe("subscriptions");
  });
});
