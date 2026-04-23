import { z } from "zod";

export const createCheckoutRequestSchema = z.object({
  productKey: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
