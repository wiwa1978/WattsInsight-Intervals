import { z } from "zod";
import { creditPackages, billingConfig } from "@/config/billing";

// Inferred types from config
export type CreditPackage = typeof creditPackages[number];
export type BillingConfig = typeof billingConfig;
export type FeatureType = keyof typeof billingConfig.features;

// Database types (for when you add the schema later)
export type UserCredits = {
  id: string;
  userId: string;
  balance: string;
  totalPurchased: string;
  totalSpent: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditTransaction = {
  id: string;
  userId: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment";
  amount: string;
  description: string;
  referenceType?: "payment" | "feature_usage" | "admin" | "bonus";
  referenceId?: string;
  metadata?: Record<string, unknown>;
  balanceAfter: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditPurchase = {
  id: string;
  userId: string;
  packageKey: string;
  credits: number;
  bonusCredits: number;
  price: number;
  paymentProvider: string;
  paymentId: string;
  paymentStatus: "pending" | "completed" | "failed" | "refunded";
  createdAt: Date;
  updatedAt: Date;
};

// Validation schemas
export const creditUsageSchema = z.object({
  feature: z.enum(Object.keys(billingConfig.features) as [string, ...string[]]),
  description: z.string().optional(),
});

export const creditPurchaseSchema = z.object({
  packageKey: z.enum(creditPackages.map(pkg => pkg.key) as [string, ...string[]]),
  paymentId: z.string(),
});
