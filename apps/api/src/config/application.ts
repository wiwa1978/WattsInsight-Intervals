export type BillingMode = "credits" | "subscriptions";

function getConfiguredBillingMode(): BillingMode {
  return process.env.BILLING_MODE === "subscriptions" ? "subscriptions" : "credits";
}

export const applicationConfig = {
  billing: {
    mode: getConfiguredBillingMode(),
  },
  features: {
    billing: true,
    notifications: true,
    discounts: true,
    vouchers: true,
    wattsinsight: true,
  },
} as const;

export type ApplicationFeatureFlag = keyof typeof applicationConfig.features;

export function isFeatureEnabled(feature: ApplicationFeatureFlag) {
  return applicationConfig.features[feature];
}

export type ApplicationConfig = typeof applicationConfig;
