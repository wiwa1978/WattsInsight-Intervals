import { z } from "zod";

import { paginationQuerySchema } from "../common/pagination";
import { optionalLimitQuerySchema, timeRangeSchema } from "../common/query";

export const verifyAdminSecretSchema = z.object({
  secret: z.string().trim().min(1).max(255),
});

export const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
  reason: z.string().trim().max(1000).optional(),
  confirmed: z.boolean().optional(),
  secret: z.string().trim().min(1).max(255),
});

export const userOnlySchema = z.object({
  userId: z.string().uuid(),
  secret: z.string().trim().min(1).max(255),
});

export const setUserPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
  secret: z.string().trim().min(1).max(255),
});

export const banUserSchema = z.strictObject({
  userId: z.string().uuid(),
  secret: z.string().trim().min(1).max(255),
  banReason: z.string().trim().min(1).max(1000).optional(),
  banExpiresIn: z.number().int().positive().optional(),
});

export const billingRangeQuerySchema = z.object({
  timeRange: timeRangeSchema.default("daily"),
});

export const billingListQuerySchema = paginationQuerySchema.extend({
  searchEmail: z.string().trim().email().max(255).optional(),
});

export const adminBillingDashboardRangeSchema = z.enum(["7d", "30d", "90d", "12m", "ytd"]);

export const adminCreditsDashboardQuerySchema = z.object({
  creditsPurchasesPage: z.coerce.number().int().min(1).default(1),
  creditsPurchasesSearch: z.string().trim().max(255).optional(),
  creditsRefundsPage: z.coerce.number().int().min(1).default(1),
  creditsRefundsSearch: z.string().trim().max(255).optional(),
  range: adminBillingDashboardRangeSchema.default("30d"),
});

export const createCreditRefundSchema = z.object({
  paymentId: z.string().trim().min(1, "Payment ID is required").max(255),
  reason: z.string().trim().max(3000, "Reason must be 3000 characters or fewer").optional(),
  secret: z.string().trim().min(1).max(255),
});

export const createSubscriptionRefundSchema = z.object({
  paymentId: z.string().trim().min(1, "Payment ID is required").max(255),
  reason: z.string().trim().max(3000, "Reason must be 3000 characters or fewer").optional(),
  secret: z.string().trim().min(1).max(255),
});

export const adminSecretOnlySchema = z.object({
  secret: z.string().trim().min(1).max(255),
});

export const webhookEventStatusSchema = z.enum(["processing", "processed", "failed"]);

export const webhookEventsQuerySchema = paginationQuerySchema.extend({
  provider: z.string().trim().min(1).max(100).optional(),
  status: webhookEventStatusSchema.optional(),
  eventType: z.string().trim().min(1).max(255).optional(),
  paymentId: z.string().trim().min(1).max(255).optional(),
  text: z.string().trim().min(1).max(255).optional(),
  dateFrom: z.string().trim().min(1).max(40).optional(),
  dateTo: z.string().trim().min(1).max(40).optional(),
});

export const webhookEventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

export const searchUsersQuerySchema = z.object({
  query: z.string().trim().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export { optionalLimitQuerySchema };
