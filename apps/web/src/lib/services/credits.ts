import { createCreditsApi } from "@platform/frontend-shared/credits";

import { billingConfig } from "@/config/billing";
import { apiRequest } from "@/lib/api/client";
import { redeemMyVoucher } from "@/lib/api/me";

const creditsApi = createCreditsApi(apiRequest);

export async function getCreditBalance() {
  const result = await creditsApi.getBalance();
  return result.data;
}

export async function getCreditHistory(limit: number = 50) {
  const result = await creditsApi.getHistory(limit);
  return result.data;
}

export async function getCreditPurchases(limit: number = 50) {
  const result = await creditsApi.getPurchases(limit);
  return result.data;
}

export async function downloadInvoice(paymentId: string) {
  return creditsApi.downloadInvoice(paymentId);
}

export async function redeemVoucher(code: string) {
  return redeemMyVoucher(code);
}

export async function canUseFeature(feature: keyof typeof billingConfig.features) {
  const balance = await getCreditBalance();
  return balance.balance >= billingConfig.features[feature];
}

export async function requireCredits(feature: keyof typeof billingConfig.features) {
  const canUse = await canUseFeature(feature);
  if (!canUse) {
    const cost = billingConfig.features[feature];
    const { balance } = await getCreditBalance();
    throw new Error(`Insufficient credits. Required: ${cost}, Available: ${balance}`);
  }
}
