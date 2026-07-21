import { describe, expect, it } from "vitest";

import { getBillingCapability } from "../src/billing-capabilities";

describe("getBillingCapability", () => {
  it("returns disabled capability when config is missing", () => {
    expect(getBillingCapability(undefined)).toEqual({
      enabled: false,
      mode: "disabled",
      userBillingVisible: false,
      adminBillingVisible: false,
      creditsVisible: false,
      subscriptionsVisible: false,
      vouchersVisible: false,
      discountsVisible: false,
    });
  });

  it("returns credits capability", () => {
    expect(
      getBillingCapability({
        billing: {
          enabled: true,
          mode: "credits",
          creditSurfacesEnabled: true,
          subscriptionSurfacesEnabled: false,
        },
        features: { vouchers: true, discounts: true, notifications: true },
      }),
    ).toMatchObject({
      enabled: true,
      mode: "credits",
      userBillingVisible: true,
      adminBillingVisible: true,
      creditsVisible: true,
      subscriptionsVisible: false,
      vouchersVisible: true,
      discountsVisible: true,
    });
  });

  it("returns subscriptions capability", () => {
    expect(
      getBillingCapability({
        billing: {
          enabled: true,
          mode: "subscriptions",
          creditSurfacesEnabled: false,
          subscriptionSurfacesEnabled: true,
        },
        features: { vouchers: true, discounts: true, notifications: true },
      }),
    ).toMatchObject({
      mode: "subscriptions",
      creditsVisible: false,
      subscriptionsVisible: true,
      vouchersVisible: false,
      discountsVisible: true,
    });
  });

  it("returns hybrid mode when both billing surfaces are enabled", () => {
    expect(
      getBillingCapability({
        billing: {
          enabled: true,
          mode: "credits",
          creditSurfacesEnabled: true,
          subscriptionSurfacesEnabled: true,
        },
        features: { vouchers: false, discounts: false, notifications: true },
      }),
    ).toMatchObject({
      enabled: true,
      mode: "hybrid",
      userBillingVisible: true,
      adminBillingVisible: true,
      creditsVisible: true,
      subscriptionsVisible: true,
      vouchersVisible: false,
      discountsVisible: false,
    });
  });

  it("returns disabled capability when billing is disabled", () => {
    expect(
      getBillingCapability({
        billing: {
          enabled: false,
          mode: "subscriptions",
          creditSurfacesEnabled: true,
          subscriptionSurfacesEnabled: true,
        },
        features: { vouchers: true, discounts: true, notifications: true },
      }),
    ).toEqual({
      enabled: false,
      mode: "disabled",
      userBillingVisible: false,
      adminBillingVisible: false,
      creditsVisible: false,
      subscriptionsVisible: false,
      vouchersVisible: false,
      discountsVisible: false,
    });
  });
});
