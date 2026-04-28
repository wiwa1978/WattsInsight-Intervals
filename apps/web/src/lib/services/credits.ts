import { createCreditsApi } from "@platform/frontend-shared/credits";

import { billingConfig } from "@/config/billing";
import { apiRequest } from "@/lib/api/client";
import { redeemMyVoucher } from "@/lib/api/me";

type CreditHistoryItem = {
  id: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment" | "voucher";
  amount: string;
  balanceAfter: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: unknown;
  createdAt: string;
};

type CreditPurchaseItem = {
  id: string;
  packageKey: string;
  credits: number;
  bonusCredits: number;
  priceInclVat: number;
  priceExclVat: number;
  paymentStatus: "pending" | "completed" | "failed" | "refunded";
  paymentId: string;
  createdAt: string;
};

const creditsApi = createCreditsApi(apiRequest);

export async function getCreditBalance() {
  const result = await creditsApi.getBalance() as { success: boolean; data: {
    balance: number;
    totalPurchased: number;
    totalSpent: number;
    totalPurchasedAmount: number;
    totalPurchasedAmountExclVat: number;
    totalVatPaid: number;
    totalPurchases: number;
  } };
  return result.data;
}

export async function getCreditHistory(limit: number = 50) {
  const result = await creditsApi.getHistory(limit) as { success: boolean; data: CreditHistoryItem[] };
  return result.data;
}

export async function getCreditPurchases(limit: number = 50) {
  const result = await creditsApi.getPurchases(limit) as { success: boolean; data: CreditPurchaseItem[] };
  return result.data;
}

export async function downloadInvoice(paymentId: string) {
  return creditsApi.downloadInvoice(paymentId) as Promise<{ success: boolean; invoiceUrl?: string; error?: string }>;
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
