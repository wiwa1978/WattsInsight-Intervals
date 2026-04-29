import { z } from "zod";

import { successResultSchema } from "../common/result";

export const creditBalanceSchema = z.object({
  balance: z.number().nonnegative(),
  totalPurchased: z.number().nonnegative(),
  totalSpent: z.number().nonnegative(),
  totalPurchasedAmount: z.number().nonnegative(),
  totalPurchasedAmountExclVat: z.number().nonnegative(),
  totalVatPaid: z.number().nonnegative(),
  totalPurchases: z.number().int().nonnegative(),
});

export const creditTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(["purchase", "usage", "refund", "bonus", "admin_adjustment", "voucher"]),
  amount: z.string(),
  balanceAfter: z.string(),
  description: z.string(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.string(),
});

export const creditPurchaseSchema = z.object({
  id: z.string(),
  packageKey: z.string(),
  credits: z.number().int().nonnegative(),
  bonusCredits: z.number().int().nonnegative(),
  priceExclVat: z.number().nonnegative(),
  priceInclVat: z.number().nonnegative(),
  vatAmount: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  paymentStatus: z.enum(["pending", "completed", "failed", "refunded"]),
  paymentId: z.string().optional(),
  createdAt: z.string(),
  userId: z.string().optional(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().optional(),
});

export const billingStatsSchema = z.object({
  totalPurchases: z.number().int().nonnegative(),
  totalCreditsPurchased: z.number().nonnegative(),
  purchasedCredits: z.number().nonnegative(),
  bonusCredits: z.number().nonnegative(),
  totalCreditsConsumed: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
});

export const revenuePointSchema = z.object({
  period: z.string(),
  revenue: z.number().nonnegative(),
  count: z.number().int().nonnegative(),
});

export const transactionPointSchema = z.object({
  period: z.string(),
  count: z.number().int().nonnegative(),
});

export const creditsConsumedPointSchema = z.object({
  period: z.string(),
  consumed: z.number().nonnegative(),
});

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "paused",
]);

export const userSubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  planKey: z.string(),
  dodoCustomerId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().optional(),
});

export const subscriptionPaymentSchema = z.object({
  id: z.string(),
  planKey: z.string(),
  dodoSubscriptionId: z.string().nullable().optional(),
  paymentStatus: z.enum(["pending", "completed", "failed", "refunded"]),
  paymentId: z.string(),
  priceExclVat: z.number().int().nonnegative(),
  priceInclVat: z.number().int().nonnegative(),
  vatAmount: z.number().int().nonnegative(),
  currency: z.string(),
  createdAt: z.string(),
});

export const subscriptionStatsSchema = z.object({
  totalSubscriptions: z.number().int().nonnegative(),
  activeSubscriptions: z.number().int().nonnegative(),
  trialingSubscriptions: z.number().int().nonnegative(),
  pastDueSubscriptions: z.number().int().nonnegative(),
  canceledSubscriptions: z.number().int().nonnegative(),
  monthlyRecurringRevenue: z.number().nonnegative(),
  annualRecurringRevenue: z.number().nonnegative(),
});

export const transactionsListSchema = z.object({
  transactions: z.array(creditTransactionSchema.extend({
    userId: z.string(),
    userName: z.string().nullable().optional(),
    userEmail: z.string(),
  })),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const purchasesListSchema = z.object({
  purchases: z.array(creditPurchaseSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const subscriptionsListSchema = z.object({
  subscriptions: z.array(userSubscriptionSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const applicationConfigSchema = z.object({
  billing: z.object({
    enabled: z.boolean(),
    mode: z.enum(["credits", "subscriptions"]),
    creditSurfacesEnabled: z.boolean(),
    subscriptionSurfacesEnabled: z.boolean(),
  }),
  features: z.object({
    vouchers: z.boolean(),
    discounts: z.boolean(),
    notifications: z.boolean(),
  }),
});

export const creditBalanceResponseSchema = successResultSchema(creditBalanceSchema);
export const creditHistoryResponseSchema = successResultSchema(z.array(creditTransactionSchema));
export const creditPurchasesResponseSchema = successResultSchema(z.array(creditPurchaseSchema));
export const billingStatsResponseSchema = successResultSchema(billingStatsSchema);
export const revenueDataResponseSchema = successResultSchema(z.array(revenuePointSchema));
export const transactionsDataResponseSchema = successResultSchema(transactionsListSchema);
export const purchasesDataResponseSchema = successResultSchema(purchasesListSchema);
export const transactionChartResponseSchema = successResultSchema(z.array(transactionPointSchema));
export const creditsConsumedChartResponseSchema = successResultSchema(z.array(creditsConsumedPointSchema));
export const userSubscriptionResponseSchema = successResultSchema(userSubscriptionSchema.nullable());
export const subscriptionPaymentsResponseSchema = successResultSchema(z.array(subscriptionPaymentSchema));
export const subscriptionsListResponseSchema = successResultSchema(subscriptionsListSchema);
export const subscriptionStatsResponseSchema = successResultSchema(subscriptionStatsSchema);
export const applicationConfigResponseSchema = successResultSchema(applicationConfigSchema);

export const consumeCreditsResponseSchema = z.object({
  transactionId: z.string(),
  idempotencyKey: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  alreadyProcessed: z.boolean(),
});

export type ConsumeCreditsResponse = z.infer<typeof consumeCreditsResponseSchema>;

export const consumeCreditsApiResponseSchema = successResultSchema(consumeCreditsResponseSchema);

export type CreditBalance = z.infer<typeof creditBalanceSchema>;
export type CreditTransaction = z.infer<typeof creditTransactionSchema>;
export type CreditPurchase = z.infer<typeof creditPurchaseSchema>;
export type BillingStats = z.infer<typeof billingStatsSchema>;
export type RevenuePoint = z.infer<typeof revenuePointSchema>;
export type TransactionPoint = z.infer<typeof transactionPointSchema>;
export type CreditsConsumedPoint = z.infer<typeof creditsConsumedPointSchema>;
export type TransactionsList = z.infer<typeof transactionsListSchema>;
export type PurchasesList = z.infer<typeof purchasesListSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type UserSubscription = z.infer<typeof userSubscriptionSchema>;
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>;
export type SubscriptionsList = z.infer<typeof subscriptionsListSchema>;
export type SubscriptionStats = z.infer<typeof subscriptionStatsSchema>;
export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
