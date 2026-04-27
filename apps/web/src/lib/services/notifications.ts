import {
  deleteMyNotification,
  getMyActiveBannerNotification,
  getMyNotifications,
  getMyUnreadNotificationsCount,
  markAllMyNotificationsAsRead,
  markMyNotificationAsRead,
} from "@/lib/api/me";

export async function getNotifications(limit = 20) {
  try {
    const data = await getMyNotifications(limit);
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notifications" };
  }
}

export async function getActiveBannerNotifications() {
  try {
    const data = await getMyActiveBannerNotification();
    return { success: true, data };
  } catch {
    return { success: false, data: null };
  }
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
