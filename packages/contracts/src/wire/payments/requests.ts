import { z } from "zod";

const checkoutKeySchema = z.string().trim().min(1).max(64);

export const createCheckoutRequestSchema = z.union([
  z.object({
    billingMode: z.literal("credits"),
    packageKey: checkoutKeySchema,
  }),
  z.object({
    billingMode: z.literal("subscriptions"),
    planKey: checkoutKeySchema,
  }),
  z.object({
    packageKey: checkoutKeySchema,
  }),
]);

export const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
