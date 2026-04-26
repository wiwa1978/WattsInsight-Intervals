import { z } from "zod";

import { paginationQuerySchema } from "../common/pagination";
import { optionalLimitQuerySchema, timeRangeSchema } from "../common/query";

export const verifyBanSecretSchema = z.object({
  secret: z.string().trim().min(1).max(255),
});

export const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});

export const userOnlySchema = z.object({
  userId: z.string().uuid(),
});

export const setUserPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
});

export const banUserSchema = z.object({
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

export const searchUsersQuerySchema = z.object({
  query: z.string().trim().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export { optionalLimitQuerySchema };
