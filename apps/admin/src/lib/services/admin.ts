import {
  banAdminUserApi,
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
  getAdminBillingStatsApi,
  getAdminCreditsConsumedDataApi,
  getAdminDashboardStatsApi,
  getAdminRevenueDataApi,
  getAdminTransactionDataApi,
  getAdminUserApi,
  getAdminUserCreditBalanceApi,
  getAdminUserCreditHistoryApi,
  getAdminUserCreditPurchasesApi,
  getAdminUserStatsApi,
  getAdminUsersApi,
  impersonateAdminUserApi,
  revokeAdminUserSessionsApi,
  setAdminUserPasswordApi,
  setAdminUserRoleApi,
  stopAdminImpersonationApi,
  unbanAdminUserApi,
  verifyAdminBanSecretApi,
} from "@/lib/api/admin";
import type {
  AdminDashboardStats,
  AdminUserDetail,
  AdminUsersList,
  AdminUserStats,
  BillingStats,
  CreditBalance,
  CreditPurchase,
  CreditTransaction,
  CreditsConsumedPoint,
  PurchasesList,
  RevenuePoint,
  TransactionPoint,
  TransactionsList,
} from "@platform/contracts";

export type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

export async function verifyAdminBanSecret(secret: string) {
  return verifyAdminBanSecretApi(secret);
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  return getAdminDashboardStatsApi();
}

export async function getAdminUserStats() {
  try {
    const stats: AdminUserStats = await getAdminUserStatsApi();

    return stats;
  } catch {
    return {
      totalUsers: 0,
      totalAdmins: 0,
      totalBanned: 0,
    };
  }
}

export async function getAdminUser(userId: string) {
  try {
    const response = await getAdminUserApi(userId);

    if (!response.success || !response.data) {
      return { data: null, error: response.error || "User not found" };
    }

    return { data: response.data, error: null };
  } catch {
    return { data: null, error: "Failed to fetch user" };
  }
}

export async function getAdminUserCreditBalance(userId: string): Promise<CreditBalance> {
  return getAdminUserCreditBalanceApi(userId);
}

export async function getAdminUserCreditHistory(userId: string, limit: number = 50) {
  const history: CreditTransaction[] = await getAdminUserCreditHistoryApi(userId);
  if (Array.isArray(history)) {
    return history.slice(0, limit);
  }

  return [];
}

export async function getAdminUserCreditPurchases(userId: string, limit: number = 50) {
  const purchases: CreditPurchase[] = await getAdminUserCreditPurchasesApi(userId);
  if (Array.isArray(purchases)) {
    return purchases.slice(0, limit);
  }

  return [];
}

export async function getAdminBillingStats(): Promise<BillingStats> {
  return getAdminBillingStatsApi();
}

export async function getAdminRevenueData(timeRange: TimeRange): Promise<RevenuePoint[]> {
  return getAdminRevenueDataApi(timeRange);
}

export async function getAdminAllTransactions(limit: number = 20, offset: number = 0, searchEmail?: string) {
  return getAdminAllTransactionsApi(limit, offset, searchEmail);
}

export async function getAdminAllPurchases(limit: number = 20, offset: number = 0, searchEmail?: string) {
  return getAdminAllPurchasesApi(limit, offset, searchEmail);
}

export async function getAdminTransactionData(timeRange: TimeRange): Promise<TransactionPoint[]> {
  return getAdminTransactionDataApi(timeRange);
}

export async function getAdminCreditsConsumedData(timeRange: TimeRange): Promise<CreditsConsumedPoint[]> {
  return getAdminCreditsConsumedDataApi(timeRange);
}

export async function getUsers(limit = 20, offset = 0, search?: string): Promise<{ data: AdminUsersList; error: string | null }> {
  try {
    const result: AdminUsersList = await getAdminUsersApi(limit, offset, search);

    return { data: result, error: null };
  } catch {
    return { data: { users: [], total: 0 }, error: "Failed to fetch users" };
  }
}

export async function setAdminUserRole(userId: string, role: "user" | "admin") {
  return setAdminUserRoleApi(userId, role);
}

export async function unbanAdminUser(userId: string) {
  return unbanAdminUserApi(userId);
}

export async function banAdminUser(payload: { userId: string; secret: string; banReason?: string; banExpiresIn?: number }) {
  return banAdminUserApi(payload);
}

export async function impersonateAdminUser(userId: string) {
  return impersonateAdminUserApi(userId);
}

export async function stopAdminImpersonation(): ReturnType<typeof stopAdminImpersonationApi> {
  return stopAdminImpersonationApi();
}

export async function revokeAdminUserSessions(userId: string) {
  return revokeAdminUserSessionsApi(userId);
}

export async function setAdminUserPassword(userId: string, newPassword: string) {
  return setAdminUserPasswordApi(userId, newPassword);
}
