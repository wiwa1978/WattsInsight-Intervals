import { z } from "zod";

export const createCheckoutRequestSchema = z.object({
  packageKey: z.string().trim().min(1).max(64),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
