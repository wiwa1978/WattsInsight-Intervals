import { z } from "zod";

export const consumeCreditsRequestSchema = z.object({
  featureKey: z.string().trim().min(1).max(100),
  amount: z.number().positive().max(100_000),
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConsumeCreditsRequest = z.infer<typeof consumeCreditsRequestSchema>;
