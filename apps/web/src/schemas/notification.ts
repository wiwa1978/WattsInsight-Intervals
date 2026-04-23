/**
 * Notification Type Definitions
 *
 * Centralized types and schemas for the notification system.
 */

import { z } from "zod";

/**
 * Notification type (visual styling)
 */
export type NotificationType = "info" | "warning" | "success" | "error";

/**
 * Notification category (logical grouping)
 */
export type NotificationCategory =
  | "security"
  | "account"
  | "billing"
  | "usage"
  | "system";

/**
 * Notification object structure
 */
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  read: boolean;
  showAsBanner: boolean;
  bannerExpiresAt: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
  data: Record<string, unknown> | null;
}

/**
 * Translation function type from next-intl
 */
export interface TranslateFunction {
  (key: string, values?: Record<string, unknown>): string;
}

/**
 * Translated notification result
 */
export interface TranslatedNotification {
  title: string;
  message: string;
}

/**
 * Admin notification form schema
 */
export const sendNotificationSchema = z.object({
  titleEn: z.string().min(1, "English title is required").max(100, "Title is too long"),
  messageEn: z.string().min(1, "English message is required").max(500, "Message is too long"),
  titleNl: z.string().min(1, "Dutch title is required").max(100, "Title is too long"),
  messageNl: z.string().min(1, "Dutch message is required").max(500, "Message is too long"),
  titleFr: z.string().min(1, "French title is required").max(100, "Title is too long"),
  messageFr: z.string().min(1, "French message is required").max(500, "Message is too long"),
  type: z.enum(["info", "success", "warning", "error"]),
  category: z.enum(["security", "account", "billing", "usage", "system"]),
  showAsBanner: z.boolean(),
  bannerExpiresAt: z.date().optional(),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
