import { z } from "zod";

const checkoutReturnUrlSchema = z.string().trim().min(1).max(2048);

export const createCheckoutRequestSchema = z.object({
  packageKey: z.string().trim().min(1).max(64),
  successUrl: checkoutReturnUrlSchema.optional(),
  cancelUrl: checkoutReturnUrlSchema.optional(),
});

export const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
