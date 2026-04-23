import { z } from "zod";

export const mobileTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string().min(16),
    refreshToken: z.string().min(16),
    expiresInSeconds: z.number().int().positive(),
    tokenType: z.literal("Bearer"),
  }),
});

export const mobileTokenErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
});

export const mobileTokenResultSchema = z.union([
  mobileTokenResponseSchema,
  mobileTokenErrorSchema,
]);
