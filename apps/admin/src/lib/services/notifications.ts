import {
  getNotificationSendHistoryApi,
  sendNotificationToAllUsersApi,
  sendNotificationToUsersApi,
} from "@/lib/api/admin";
import {
  deleteMyNotification,
  getMyNotifications,
  getMyUnreadNotificationsCount,
  markAllMyNotificationsAsRead,
  markMyNotificationAsRead,
} from "@/lib/api/me";
import type { Notification as NotificationRecord } from "@/schemas/notification";
import type { NotificationSendHistoryItem } from "@platform/contracts";

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

export async function createNotification({
  userId,
  title,
  message,
  type = "info",
  category,
  data,
  showAsBanner = false,
  bannerExpiresAt,
}: {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  try {
    const result = await sendNotificationToUsersApi({
      userIds: [userId],
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
    });

    if (result.data.sentCount !== 1 || result.data.invalidRecipientCount > 0) {
      return { success: false, error: "Failed to create notification" };
    }

    return { success: true, data: null };
  } catch {
    return { success: false, error: "Failed to create notification" };
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

export async function sendNotificationToAllUsers({
  title,
  message,
  type = "info",
  category = "system",
  data,
  showAsBanner = false,
  bannerExpiresAt,
}: {
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  try {
    const result = await sendNotificationToAllUsersApi({
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
    });

    return { success: true as const, ...result.data };
  } catch {
    return { success: false as const, error: "Failed to send notification to all users" };
  }
}

export async function sendNotificationToUsers({
  userIds,
  title,
  message,
  type = "info",
  category = "system",
  data,
  showAsBanner = false,
  bannerExpiresAt,
}: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  try {
    const result = await sendNotificationToUsersApi({
      userIds,
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
    });

    return { success: true as const, ...result.data };
  } catch {
    return { success: false as const, error: "Failed to send notification to users" };
  }
}

export async function getAllNotifications(limit = 50) {
  return getNotificationSendHistory(limit);
}

export async function getNotificationSendHistory(limit = 50) {
  try {
    const data = (await getNotificationSendHistoryApi(limit)) as NotificationSendHistoryItem[];
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notification send history" };
  }
}
