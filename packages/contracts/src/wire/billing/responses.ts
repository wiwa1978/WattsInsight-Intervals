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
  purchaseBonusCredits: z.number().nonnegative().optional(),
  voucherCredits: z.number().optional(),
  refundCredits: z.number().optional(),
  adminAdjustmentCredits: z.number().optional(),
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

export const adminTransactionListItemSchema = creditTransactionSchema.extend({
  userId: z.string(),
  userName: z.string().nullable().optional(),
  userEmail: z.string(),
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
  providerCustomerId: z.string().nullable().optional(),
  providerSubscriptionId: z.string(),
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
  providerSubscriptionId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string().nullable().optional(),
  paymentStatus: z.string(),
  paymentId: z.string(),
  priceExclVat: z.number().int().nonnegative(),
  priceInclVat: z.number().int().nonnegative(),
  vatAmount: z.number().int().nonnegative(),
  currency: z.string(),
  paymentMethod: z.string().nullable().optional(),
  paymentMethodType: z.string().nullable().optional(),
  refundStatus: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const adminBillingWarningSchema = z.object({
  source: z.string(),
  message: z.string(),
});

export const adminBillingPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  search: z.string(),
});

export const adminCreditsDashboardSchema = z.object({
  stats: billingStatsSchema.extend({
    purchaseBonusCredits: z.number(),
    voucherCredits: z.number(),
    refundCredits: z.number(),
    adminAdjustmentCredits: z.number(),
  }),
  revenue: z.object({
    dailyData: z.array(revenuePointSchema),
    weeklyData: z.array(revenuePointSchema),
    monthlyData: z.array(revenuePointSchema),
    yearlyData: z.array(revenuePointSchema),
  }),
  consumption: z.object({
    dailyData: z.array(creditsConsumedPointSchema),
    weeklyData: z.array(creditsConsumedPointSchema),
    monthlyData: z.array(creditsConsumedPointSchema),
    yearlyData: z.array(creditsConsumedPointSchema),
  }),
  activity: z.object({
    dailyData: z.array(transactionPointSchema),
    weeklyData: z.array(transactionPointSchema),
    monthlyData: z.array(transactionPointSchema),
    yearlyData: z.array(transactionPointSchema),
  }),
  transactions: z.array(adminTransactionListItemSchema),
  purchases: z.array(creditPurchaseSchema),
  refundablePurchases: z.array(creditPurchaseSchema),
  refundedPurchases: z.array(creditPurchaseSchema),
  pagination: z.object({
    purchases: adminBillingPaginationSchema,
    refunds: adminBillingPaginationSchema,
  }),
  warnings: z.array(adminBillingWarningSchema),
});

export const adminRefundSchema = z.object({
  refundId: z.string(),
  paymentId: z.string(),
  status: z.string(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const adminCreditRefundResponseDataSchema = z.object({
  refund: adminRefundSchema,
  purchase: creditPurchaseSchema,
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

export const subscriptionFinanceSummarySchema = z.object({
  currency: z.string(),
  grossRevenue: z.number().nonnegative(),
  refundedRevenue: z.number().nonnegative(),
  netRevenue: z.number(),
  totalPayments: z.number().int().nonnegative(),
  completedPayments: z.number().int().nonnegative(),
  refundedPayments: z.number().int().nonnegative(),
  failedPayments: z.number().int().nonnegative(),
  pendingPayments: z.number().int().nonnegative(),
  providerFinanceAvailable: z.boolean(),
  providerPaymentsChecked: z.number().int().nonnegative(),
  providerSubscriptionsChecked: z.number().int().nonnegative(),
  unmatchedProviderPayments: z.number().int().nonnegative(),
  unmatchedProviderSubscriptions: z.number().int().nonnegative(),
});

export const subscriptionPlanDistributionPointSchema = z.object({
  planKey: z.string(),
  count: z.number().int().nonnegative(),
});

export const subscriptionEventSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  providerSubscriptionId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string().nullable().optional(),
  eventType: z.string(),
  status: subscriptionStatusSchema.nullable().optional(),
  createdAt: z.string(),
});

export const transactionsListSchema = z.object({
  transactions: z.array(adminTransactionListItemSchema),
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
export const subscriptionFinanceSummaryResponseSchema = successResultSchema(subscriptionFinanceSummarySchema);
export const subscriptionPlanDistributionResponseSchema = successResultSchema(z.array(subscriptionPlanDistributionPointSchema));
export const subscriptionEventsResponseSchema = successResultSchema(z.array(subscriptionEventSchema));
export const applicationConfigResponseSchema = successResultSchema(applicationConfigSchema);
export const adminCreditsDashboardResponseSchema = successResultSchema(adminCreditsDashboardSchema);
export const adminCreditRefundResponseSchema = successResultSchema(adminCreditRefundResponseDataSchema);

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
export type SubscriptionFinanceSummary = z.infer<typeof subscriptionFinanceSummarySchema>;
export type SubscriptionPlanDistributionPoint = z.infer<typeof subscriptionPlanDistributionPointSchema>;
export type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;
export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
export type AdminBillingWarning = z.infer<typeof adminBillingWarningSchema>;
export type AdminBillingPagination = z.infer<typeof adminBillingPaginationSchema>;
export type AdminCreditsDashboard = z.infer<typeof adminCreditsDashboardSchema>;
export type AdminRefund = z.infer<typeof adminRefundSchema>;
export type AdminCreditRefundResponseData = z.infer<typeof adminCreditRefundResponseDataSchema>;
