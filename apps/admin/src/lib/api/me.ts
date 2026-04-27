import { apiRequest } from "./client";
import type { Notification } from "@/schemas/notification";

export type CountryRecord = {
  id: string;
  name: string;
  code: string;
  language: string;
};

export async function getMyCreditBalance() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/me/credits/balance");
  return result.data;
}

export async function getMyCreditHistory(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/me/credits/history?limit=${limit}`);
  return result.data;
}

export async function getMyCreditPurchases(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/me/credits/purchases?limit=${limit}`);
  return result.data;
}

export async function downloadMyInvoice(paymentId: string) {
  return apiRequest<{ success: boolean; invoiceUrl?: string; error?: string }>("/me/credits/invoice", {
    method: "POST",
    body: JSON.stringify({ paymentId }),
  });
}

export async function redeemMyVoucher(code: string) {
  return apiRequest<{
    success: boolean;
    creditsAdded?: number;
    newBalance?: number;
    error?: string;
  }>("/me/vouchers/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getMyNotifications(limit = 20) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/me/notifications?limit=${limit}`);
  return result.data;
}

export async function getMyActiveBannerNotification() {
  const result = await apiRequest<{ success: boolean; data: Notification | null }>("/me/notifications/active-banner");
  return result.data;
}

export async function getMyUnreadNotificationsCount() {
  const result = await apiRequest<{ success: boolean; data: { count: number } }>("/me/notifications/unread-count");
  return result.data.count;
}

export async function markMyNotificationAsRead(notificationId: string) {
  return apiRequest<{ success: boolean; data: { marked: boolean } }>(`/me/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export async function markAllMyNotificationsAsRead() {
  return apiRequest<{ success: boolean; data: { marked: boolean } }>("/me/notifications/read-all", {
    method: "POST",
  });
}

export async function deleteMyNotification(notificationId: string) {
  return apiRequest<{ success: boolean; data: { deleted: boolean } }>(`/me/notifications/${notificationId}`, {
    method: "DELETE",
  });
}

export async function getCountries(lang: "en" | "fr" | "nl") {
  const result = await apiRequest<{ success: boolean; data: CountryRecord[] }>(`/countries?lang=${lang}`);
  return result.data;
}

export async function createCheckoutSession(packageKey: string) {
  return apiRequest<{ success: boolean; data: { checkoutUrl: string } }>("/payments/checkout", {
    method: "POST",
    body: JSON.stringify({ packageKey }),
  });
}
