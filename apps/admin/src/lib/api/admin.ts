import { apiRequest } from "./client";

export async function verifyAdminBanSecretApi(secret: string) {
  return apiRequest<{ success: boolean; error?: string }>("/admin/verify-ban-secret", {
    method: "POST",
    body: JSON.stringify({ secret }),
  });
}

export async function getAdminDashboardStatsApi() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/admin/dashboard/stats");
  return result.data;
}

export async function getAdminUsersApi(limit = 20, offset = 0) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(
    `/admin/users?limit=${limit}&offset=${offset}`,
  );
  return result.data;
}

export async function setAdminUserRoleApi(userId: string, role: "user" | "admin") {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/set-role", {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
}

export async function unbanAdminUserApi(userId: string) {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/unban", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function banAdminUserApi(payload: { userId: string; banReason?: string; banExpiresIn?: number }) {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/ban", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function impersonateAdminUserApi(userId: string) {
  return apiRequest<{ session?: unknown; user?: unknown; error?: { message?: string } | string }>(
    "/admin/users/impersonate",
    {
      method: "POST",
      body: JSON.stringify({ userId }),
    },
  );
}

export async function stopAdminImpersonationApi() {
  return apiRequest<{ session?: unknown; user?: unknown; error?: { message?: string } | string }>(
    "/auth/admin/stop-impersonating",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function revokeAdminUserSessionsApi(userId: string) {
  return apiRequest<{ success?: boolean; error?: { message?: string } | string }>(
    "/admin/users/revoke-sessions",
    {
      method: "POST",
      body: JSON.stringify({ userId }),
    },
  );
}

export async function setAdminUserPasswordApi(userId: string, newPassword: string) {
  return apiRequest<{ status?: boolean; error?: { message?: string } | string }>("/admin/users/set-password", {
    method: "POST",
    body: JSON.stringify({ userId, newPassword }),
  });
}

export async function getAdminUserStatsApi() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/admin/users/stats");
  return result.data;
}

export async function getAdminUserApi(userId: string) {
  return apiRequest<{ success: boolean; data?: unknown; error?: string }>(`/admin/users/${userId}`);
}

export async function getAdminUserCreditBalanceApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/users/${userId}/credits/balance`);
  return result.data;
}

export async function getAdminUserCreditHistoryApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/users/${userId}/credits/history`);
  return result.data;
}

export async function getAdminUserCreditPurchasesApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/users/${userId}/credits/purchases`);
  return result.data;
}

export async function getAdminBillingStatsApi() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/admin/billing/stats");
  return result.data;
}

export async function getAdminRevenueDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/billing/revenue?timeRange=${timeRange}`);
  return result.data;
}

export async function getAdminAllTransactionsApi(limit = 20, offset = 0, searchEmail?: string) {
  const search = searchEmail ? `&searchEmail=${encodeURIComponent(searchEmail)}` : "";
  const result = await apiRequest<{ success: boolean; data: unknown }>(
    `/admin/billing/transactions?limit=${limit}&offset=${offset}${search}`,
  );
  return result.data;
}

export async function getAdminAllPurchasesApi(limit = 20, offset = 0, searchEmail?: string) {
  const search = searchEmail ? `&searchEmail=${encodeURIComponent(searchEmail)}` : "";
  const result = await apiRequest<{ success: boolean; data: unknown }>(
    `/admin/billing/purchases?limit=${limit}&offset=${offset}${search}`,
  );
  return result.data;
}

export async function getAdminTransactionDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: unknown }>(
    `/admin/billing/transactions-chart?timeRange=${timeRange}`,
  );
  return result.data;
}

export async function getAdminCreditsConsumedDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: unknown }>(
    `/admin/billing/credits-consumed-chart?timeRange=${timeRange}`,
  );
  return result.data;
}

export async function getDiscountsApi(limit = 20, offset = 0, search?: string, status?: "active" | "inactive" | "expired") {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/discounts?${params.toString()}`);
  return result.data;
}

export async function getDiscountByIdApi(discountId: string) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>(`/admin/discounts/${discountId}`);
}

export async function generateDiscountCodeApi(overridePrefix?: string) {
  return apiRequest<{ success: boolean; data?: { code: string }; error?: string }>("/admin/discounts/generate-code", {
    method: "POST",
    body: JSON.stringify({ overridePrefix }),
  });
}

export async function validateDiscountCodeApi(code: string, excludeId?: string) {
  const result = await apiRequest<{ success: boolean; data: { valid: boolean; error?: string } }>(
    "/admin/discounts/validate-code",
    {
      method: "POST",
      body: JSON.stringify({ code, excludeId }),
    },
  );
  return result.data;
}

export async function createDiscountApi(payload: {
  code: string;
  type: "fixed" | "percentage";
  value: number;
  startDate: Date;
  endDate: Date;
  maxUses?: number | null;
  userIds?: string[];
}) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>("/admin/discounts", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      startDate: payload.startDate.toISOString(),
      endDate: payload.endDate.toISOString(),
    }),
  });
}

export async function updateDiscountApi(payload: {
  id: string;
  code?: string;
  type?: "fixed" | "percentage";
  value?: number;
  startDate?: Date;
  endDate?: Date;
  maxUses?: number | null;
  status?: "active" | "inactive" | "expired";
}) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>(`/admin/discounts/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      startDate: payload.startDate?.toISOString(),
      endDate: payload.endDate?.toISOString(),
    }),
  });
}

export async function deleteDiscountApi(id: string) {
  return apiRequest<{ success: boolean; error?: string }>(`/admin/discounts/${id}`, {
    method: "DELETE",
  });
}

export async function assignDiscountToUsersApi(discountId: string, userIds: string[]) {
  return apiRequest<{ success: boolean; assignedCount?: number; error?: string }>(
    `/admin/discounts/${discountId}/assign`,
    {
      method: "POST",
      body: JSON.stringify({ userIds }),
    },
  );
}

export async function removeDiscountFromUsersApi(discountId: string, userIds: string[]) {
  return apiRequest<{ success: boolean; removedCount?: number; error?: string }>(
    `/admin/discounts/${discountId}/remove`,
    {
      method: "POST",
      body: JSON.stringify({ userIds }),
    },
  );
}

export async function searchUsersForDiscountApi(query: string, limit = 20) {
  const result = await apiRequest<{ success: boolean; data: Array<{ id: string; name: string; email: string }> }>(
    `/admin/discounts/search-users?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return result.data;
}

export async function getAllNotificationsApi(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/notifications?limit=${limit}`);
  return result.data;
}

export async function sendNotificationToAllUsersApi(payload: {
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  return apiRequest<{ success: boolean; data: { count: number } }>("/admin/notifications/send-all", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      bannerExpiresAt: payload.bannerExpiresAt?.toISOString(),
    }),
  });
}

export async function sendNotificationToUsersApi(payload: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  return apiRequest<{ success: boolean; data: { count: number } }>("/admin/notifications/send-users", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      bannerExpiresAt: payload.bannerExpiresAt?.toISOString(),
    }),
  });
}
