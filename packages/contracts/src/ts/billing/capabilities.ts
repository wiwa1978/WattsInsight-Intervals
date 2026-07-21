export type BillingMode = "credits" | "subscriptions" | "hybrid" | "disabled";

export type BillingCapabilityInput = {
  billing: {
    enabled: boolean;
    mode: "credits" | "subscriptions";
    creditSurfacesEnabled: boolean;
    subscriptionSurfacesEnabled: boolean;
  };
  features: {
    vouchers: boolean;
    discounts: boolean;
    notifications: boolean;
  };
};

export type BillingCapability = {
  enabled: boolean;
  mode: BillingMode;
  userBillingVisible: boolean;
  adminBillingVisible: boolean;
  creditsVisible: boolean;
  subscriptionsVisible: boolean;
  vouchersVisible: boolean;
  discountsVisible: boolean;
};

const disabledBillingCapability: BillingCapability = {
  enabled: false,
  mode: "disabled",
  userBillingVisible: false,
  adminBillingVisible: false,
  creditsVisible: false,
  subscriptionsVisible: false,
  vouchersVisible: false,
  discountsVisible: false,
};

export function getBillingCapability(config: BillingCapabilityInput | null | undefined): BillingCapability {
  if (!config?.billing.enabled) {
    return disabledBillingCapability;
  }

  const creditsVisible = config.billing.creditSurfacesEnabled;
  const subscriptionsVisible = config.billing.subscriptionSurfacesEnabled;

  return {
    enabled: true,
    mode: creditsVisible && subscriptionsVisible ? "hybrid" : config.billing.mode,
    userBillingVisible: creditsVisible || subscriptionsVisible,
    adminBillingVisible: true,
    creditsVisible,
    subscriptionsVisible,
    vouchersVisible: creditsVisible && config.features.vouchers,
    discountsVisible: config.features.discounts,
  };
}
