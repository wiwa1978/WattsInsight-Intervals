import { z } from "zod";

export const createCheckoutRequestSchema = z.object({
  packageKey: z.string().trim().min(1).max(64),
});

export const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
