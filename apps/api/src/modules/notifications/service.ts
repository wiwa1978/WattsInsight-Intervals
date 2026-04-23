import { and, count, desc, eq } from "drizzle-orm";

import { notification, user } from "@platform/platform-db";

type NotificationsServiceDeps = {
  db: any;
};

export function createNotificationsService(deps: NotificationsServiceDeps) {
  function normalizeLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(20, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  function dedupeUserIds(userIds: string[]) {
    return [...new Set(userIds.map((value) => value.trim()).filter(Boolean))];
  }

  async function createNotification(input: {
    userId: string;
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const [created] = await deps.db
      .insert(notification)
      .values({
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type ?? "info",
        category: input.category,
        data: input.data ?? null,
        showAsBanner: input.showAsBanner ?? false,
        bannerExpiresAt: input.bannerExpiresAt ?? null,
      })
      .returning();

    return created;
  }

  async function listForUser(userId: string, limit = 20) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select()
      .from(notification)
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(normalizedLimit);
  }

  async function unreadCount(userId: string) {
    const [result] = await deps.db
      .select({ count: count() })
      .from(notification)
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));

    return result?.count ?? 0;
  }

  async function markAsRead(userId: string, notificationId: string) {
    await deps.db
      .update(notification)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
  }

  async function markAllAsRead(userId: string) {
    await deps.db
      .update(notification)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));
  }

  async function deleteNotification(userId: string, notificationId: string) {
    await deps.db
      .delete(notification)
      .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
  }

  async function getAllNotifications(limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        category: notification.category,
        read: notification.read,
        showAsBanner: notification.showAsBanner,
        bannerExpiresAt: notification.bannerExpiresAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .orderBy(desc(notification.createdAt))
      .limit(normalizedLimit);
  }

  async function sendNotificationToAllUsers(input: {
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category?: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const users = await deps.db.select({ id: user.id }).from(user);
    const payload = users.map((u: { id: string }) => ({
      userId: u.id,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      category: input.category ?? "system",
      data: input.data ?? null,
      showAsBanner: input.showAsBanner ?? false,
      bannerExpiresAt: input.bannerExpiresAt ?? null,
    }));

    if (payload.length > 0) {
      await deps.db.insert(notification).values(payload);
    }

    return payload.length;
  }

  async function sendNotificationToUsers(input: {
    userIds: string[];
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category?: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const userIds = dedupeUserIds(input.userIds);
    const payload = userIds.map((userId) => ({
      userId,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      category: input.category ?? "system",
      data: input.data ?? null,
      showAsBanner: input.showAsBanner ?? false,
      bannerExpiresAt: input.bannerExpiresAt ?? null,
    }));

    if (payload.length > 0) {
      await deps.db.insert(notification).values(payload);
    }

    return payload.length;
  }

  return {
    createNotification,
    listForUser,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getAllNotifications,
    sendNotificationToAllUsers,
    sendNotificationToUsers,
  };
}
