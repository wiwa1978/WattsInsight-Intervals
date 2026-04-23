import {
  downloadMyInvoice,
  getMyCreditBalance,
  getMyCreditHistory,
  getMyCreditPurchases,
} from "@/lib/api/me";

import { billingConfig } from "@/config/billing";

type CreditHistoryItem = {
  id: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment";
  amount: string;
  balanceAfter: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: unknown;
  createdAt: Date;
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
  createdAt: Date;
};

export async function getCreditBalance() {
  return getMyCreditBalance() as Promise<{
    balance: number;
    totalPurchased: number;
    totalSpent: number;
    totalPurchasedAmount: number;
    totalPurchasedAmountExclVat: number;
    totalVatPaid: number;
    totalPurchases: number;
  }>;
}

export async function getCreditHistory(limit: number = 50) {
  return getMyCreditHistory(limit) as Promise<CreditHistoryItem[]>;
}

export async function getCreditPurchases(limit: number = 50) {
  return getMyCreditPurchases(limit) as Promise<CreditPurchaseItem[]>;
}

export async function downloadInvoice(paymentId: string) {
  return downloadMyInvoice(paymentId);
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
