import {
  deleteMyNotification,
  getMyNotifications,
  getMyUnreadNotificationsCount,
  markAllMyNotificationsAsRead,
  markMyNotificationAsRead,
} from "@/lib/api/me";
import type { Notification as NotificationRecord } from "@/schemas/notification";

export async function getNotifications(limit = 20) {
  try {
    const data = await getMyNotifications(limit);
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notifications" };
  }
}

export async function getActiveBannerNotifications() {
  const list = await getNotifications(20);

  if (!list.success || !Array.isArray(list.data)) {
    return { success: false, data: null };
  }

  const now = new Date();
  const banner = (list.data as NotificationRecord[]).find((item) => {
    if (!item.showAsBanner || item.read) return false;
    if (!item.bannerExpiresAt) return true;
    return new Date(item.bannerExpiresAt) > now;
  });

  return { success: true, data: banner ?? null };
}

export async function getUnreadCount() {
  try {
    const count = await getMyUnreadNotificationsCount();
    return { success: true, count };
  } catch {
    return { success: false, count: 0 };
  }
}

export async function markAsRead(notificationId: string) {
  try {
    await markMyNotificationAsRead(notificationId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark as read" };
  }
}

export async function markAllAsRead() {
  try {
    await markAllMyNotificationsAsRead();
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark all as read" };
  }
}

export async function deleteNotification(notificationId: string) {
  try {
    await deleteMyNotification(notificationId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete notification" };
  }
}
