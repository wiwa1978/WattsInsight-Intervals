import { z } from "zod";

import { billingConfig, creditPackages } from "@/config/billing";

export { billingConfig, creditPackages };
export type { CreditBalance, CreditPurchase, CreditTransaction } from "@platform/contracts";

export type CreditPackage = typeof creditPackages[number];
export type BillingConfig = typeof billingConfig;
export type FeatureType = keyof typeof billingConfig.features;

export const creditUsageSchema = z.object({
  feature: z.enum(Object.keys(billingConfig.features) as [string, ...string[]]),
  description: z.string().optional(),
});

export const creditPurchaseSchema = z.object({
  packageKey: z.enum(creditPackages.map((pkg) => pkg.key) as [string, ...string[]]),
  paymentId: z.string(),
});
