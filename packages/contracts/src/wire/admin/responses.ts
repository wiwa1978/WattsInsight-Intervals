import { z } from "zod";

import { successResultSchema } from "../common/result";
import { creditBalanceSchema, creditPurchaseSchema, creditTransactionSchema } from "../billing/responses";

export const adminDashboardStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  thisMonthUsers: z.number().int().nonnegative(),
  lastMonthUsers: z.number().int().nonnegative(),
  totalBannedUsers: z.number().int().nonnegative(),
  totalCompletedPurchases: z.number().int().nonnegative(),
  lastMonthCompletedPurchases: z.number().int().nonnegative(),
  totalPendingPurchases: z.number().int().nonnegative(),
  totalFailedPurchases: z.number().int().nonnegative(),
  totalRefundedPurchases: z.number().int().nonnegative(),
  totalUsageTransactions: z.number().int().nonnegative(),
  lastMonthUsageTransactions: z.number().int().nonnegative(),
  totalBonusTransactions: z.number().int().nonnegative(),
  totalPurchaseTransactions: z.number().int().nonnegative(),
  lastMonthPurchaseTransactions: z.number().int().nonnegative(),
  totalRefundTransactions: z.number().int().nonnegative(),
});

export const adminUserStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  totalAdmins: z.number().int().nonnegative(),
  totalBanned: z.number().int().nonnegative(),
});

export const adminUserListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export const adminUsersListSchema = z.object({
  users: z.array(adminUserListItemSchema),
  total: z.number().int().nonnegative(),
});

export const adminUserDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  banReason: z.string().nullable(),
  banExpires: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminSearchUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
});

export const adminDashboardStatsResponseSchema = successResultSchema(adminDashboardStatsSchema);
export const adminUsersListResponseSchema = successResultSchema(adminUsersListSchema);
export const adminUserStatsResponseSchema = successResultSchema(adminUserStatsSchema);
export const adminUserDetailResponseSchema = successResultSchema(adminUserDetailSchema);
export const adminUserCreditBalanceResponseSchema = successResultSchema(creditBalanceSchema);
export const adminUserCreditHistoryResponseSchema = successResultSchema(z.array(creditTransactionSchema));
export const adminUserCreditPurchasesResponseSchema = successResultSchema(z.array(creditPurchaseSchema));
export const adminSearchUsersResponseSchema = successResultSchema(z.array(adminSearchUserSchema));

export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;
export type AdminUsersList = z.infer<typeof adminUsersListSchema>;
export type AdminUserStats = z.infer<typeof adminUserStatsSchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminSearchUser = z.infer<typeof adminSearchUserSchema>;
