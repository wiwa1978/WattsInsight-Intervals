import type { SupportedLocale } from "../../wire/common/query";
import type { VoucherStatus } from "../../wire/vouchers/common";
import type { z } from "zod";

import { discountStatusSchema } from "../../wire/discounts/common";

type DiscountStatus = z.infer<typeof discountStatusSchema>;

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export const apiRoutes = {
  health: "/health",
  countries: (lang: SupportedLocale) => withQuery("/countries", { lang }),
  auth: {
    stopImpersonating: "/auth/admin/stop-impersonating",
  },
  payments: {
    checkout: "/payments/checkout",
  },
  me: {
    session: "/me/session",
    creditBalance: "/me/credits/balance",
    creditHistory: (limit = 50) => withQuery("/me/credits/history", { limit }),
    creditPurchases: (limit = 50) => withQuery("/me/credits/purchases", { limit }),
    invoice: "/me/credits/invoice",
    redeemVoucher: "/me/vouchers/redeem",
    notifications: (limit = 20) => withQuery("/me/notifications", { limit }),
    unreadNotificationsCount: "/me/notifications/unread-count",
    markNotificationRead: (notificationId: string) => `/me/notifications/${notificationId}/read`,
    markAllNotificationsRead: "/me/notifications/read-all",
    deleteNotification: (notificationId: string) => `/me/notifications/${notificationId}`,
  },
  admin: {
    session: "/admin/session",
    verifyBanSecret: "/admin/verify-ban-secret",
    dashboardStats: "/admin/dashboard/stats",
    users: (limit = 20, offset = 0) => withQuery("/admin/users", { limit, offset }),
    usersStats: "/admin/users/stats",
    user: (userId: string) => `/admin/users/${userId}`,
    userCreditBalance: (userId: string) => `/admin/users/${userId}/credits/balance`,
    userCreditHistory: (userId: string, limit = 50) => withQuery(`/admin/users/${userId}/credits/history`, { limit }),
    userCreditPurchases: (userId: string, limit = 50) => withQuery(`/admin/users/${userId}/credits/purchases`, { limit }),
    setUserRole: "/admin/users/set-role",
    unbanUser: "/admin/users/unban",
    banUser: "/admin/users/ban",
    impersonateUser: "/admin/users/impersonate",
    revokeUserSessions: "/admin/users/revoke-sessions",
    setUserPassword: "/admin/users/set-password",
    billingStats: "/admin/billing/stats",
    billingRevenue: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/revenue", { timeRange }),
    billingTransactions: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/transactions", { limit, offset, searchEmail }),
    billingPurchases: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/purchases", { limit, offset, searchEmail }),
    billingTransactionsChart: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/transactions-chart", { timeRange }),
    billingCreditsConsumedChart: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/credits-consumed-chart", { timeRange }),
    discounts: (limit = 20, offset = 0, search?: string, status?: DiscountStatus) =>
      withQuery("/admin/discounts", { limit, offset, search, status }),
    discount: (discountId: string) => `/admin/discounts/${discountId}`,
    generateDiscountCode: "/admin/discounts/generate-code",
    validateDiscountCode: "/admin/discounts/validate-code",
    assignDiscountUsers: (discountId: string) => `/admin/discounts/${discountId}/assign`,
    removeDiscountUsers: (discountId: string) => `/admin/discounts/${discountId}/remove`,
    searchDiscountUsers: (query: string, limit = 20) => withQuery("/admin/discounts/search-users", { query, limit }),
    vouchers: (limit = 20, offset = 0, search?: string, status?: VoucherStatus) =>
      withQuery("/admin/vouchers", { limit, offset, search, status }),
    voucher: (voucherId: string) => `/admin/vouchers/${voucherId}`,
    searchVoucherUsers: (query: string, limit = 20) => withQuery("/admin/vouchers/search-users", { query, limit }),
    logFiles: (stream: "app" | "audit" = "app") => withQuery("/admin/logs/files", { stream }),
    logEntries: (payload: { stream?: "app" | "audit"; file?: string; limit?: number }) =>
      withQuery("/admin/logs/entries", payload),
    notifications: (limit = 50) => withQuery("/admin/notifications", { limit }),
    sendNotificationToAllUsers: "/admin/notifications/send-all",
    sendNotificationToUsers: "/admin/notifications/send-users",
  },
} as const;
