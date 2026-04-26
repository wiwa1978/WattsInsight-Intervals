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

export type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

type AdminCreditTransaction = {
  id: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment" | "voucher";
  amount: string;
  balanceAfter: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: unknown;
  createdAt: Date;
};

type AdminCreditPurchase = {
  id: string;
  packageKey: string;
  credits: number;
  bonusCredits: number;
  priceInclVat: number;
  priceExclVat: number;
  paymentStatus: "pending" | "completed" | "failed" | "refunded";
  paymentId?: string;
  createdAt: Date;
  userId?: string;
  userName?: string | null;
  userEmail?: string;
};

export async function verifyAdminBanSecret(secret: string) {
  return verifyAdminBanSecretApi(secret);
}

export async function getAdminDashboardStats() {
  return getAdminDashboardStatsApi() as Promise<{
    totalUsers: number;
    thisMonthUsers: number;
    lastMonthUsers: number;
    totalBannedUsers: number;
    totalCompletedPurchases: number;
    lastMonthCompletedPurchases: number;
    totalPendingPurchases: number;
    totalFailedPurchases: number;
    totalRefundedPurchases: number;
    totalUsageTransactions: number;
    lastMonthUsageTransactions: number;
    totalBonusTransactions: number;
    totalPurchaseTransactions: number;
    lastMonthPurchaseTransactions: number;
    totalRefundTransactions: number;
  }>;
}

export async function getAdminUserStats() {
  try {
    const stats = (await getAdminUserStatsApi()) as {
      totalAdmins: number;
      totalBanned: number;
    };

    return stats;
  } catch {
    return {
      totalAdmins: 0,
      totalBanned: 0,
    };
  }
}

export async function getAdminUser(userId: string) {
  try {
    const response = (await getAdminUserApi(userId)) as {
      success: boolean;
      data?: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        image: string | null;
        role: string | null;
        banned: boolean | null;
        banReason: string | null;
        banExpires: Date | null;
        createdAt: Date;
        updatedAt: Date;
      };
      error?: string;
    };

    if (!response.success || !response.data) {
      return { data: null, error: response.error || "User not found" };
    }

    return { data: response.data, error: null };
  } catch {
    return { data: null, error: "Failed to fetch user" };
  }
}

export async function getAdminUserCreditBalance(userId: string) {
  return getAdminUserCreditBalanceApi(userId) as Promise<{
    balance: number;
    totalPurchased: number;
    totalSpent: number;
    totalPurchasedAmount: number;
    totalPurchasedAmountExclVat: number;
    totalVatPaid: number;
    totalPurchases: number;
  }>;
}

export async function getAdminUserCreditHistory(userId: string, limit: number = 50) {
  const history = (await getAdminUserCreditHistoryApi(userId)) as AdminCreditTransaction[];
  if (Array.isArray(history)) {
    return history.slice(0, limit);
  }

  return [];
}

export async function getAdminUserCreditPurchases(userId: string, limit: number = 50) {
  const purchases = (await getAdminUserCreditPurchasesApi(userId)) as AdminCreditPurchase[];
  if (Array.isArray(purchases)) {
    return purchases.slice(0, limit);
  }

  return [];
}

export async function getAdminBillingStats() {
  return getAdminBillingStatsApi() as Promise<{
    totalPurchases: number;
    totalCreditsPurchased: number;
    purchasedCredits: number;
    bonusCredits: number;
    totalCreditsConsumed: number;
    totalRevenue: number;
  }>;
}

export async function getAdminRevenueData(timeRange: TimeRange) {
  return getAdminRevenueDataApi(timeRange) as Promise<Array<{ period: string; revenue: number; count: number }>>;
}

export async function getAdminAllTransactions(limit: number = 20, offset: number = 0, searchEmail?: string) {
  return getAdminAllTransactionsApi(limit, offset, searchEmail) as Promise<{
    transactions: AdminCreditTransaction[];
    total: number;
    hasMore: boolean;
  }>;
}

export async function getAdminAllPurchases(limit: number = 20, offset: number = 0, searchEmail?: string) {
  return getAdminAllPurchasesApi(limit, offset, searchEmail) as Promise<{
    purchases: AdminCreditPurchase[];
    total: number;
    hasMore: boolean;
  }>;
}

export async function getAdminTransactionData(timeRange: TimeRange) {
  return getAdminTransactionDataApi(timeRange) as Promise<Array<{ period: string; count: number }>>;
}

export async function getAdminCreditsConsumedData(timeRange: TimeRange) {
  return getAdminCreditsConsumedDataApi(timeRange) as Promise<Array<{ period: string; consumed: number }>>;
}

export async function getUsers(limit = 20, offset = 0) {
  try {
    const result = (await getAdminUsersApi(limit, offset)) as {
      users: Array<{
        id: string;
        name: string;
        email: string;
        image: string | null;
        role: string | null;
        banned: boolean | null;
        emailVerified: boolean;
        createdAt: Date;
      }>;
      total: number;
    };

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

export async function stopAdminImpersonation() {
  return stopAdminImpersonationApi();
}

export async function revokeAdminUserSessions(userId: string) {
  return revokeAdminUserSessionsApi(userId);
}

export async function setAdminUserPassword(userId: string, newPassword: string) {
  return setAdminUserPasswordApi(userId, newPassword);
}
