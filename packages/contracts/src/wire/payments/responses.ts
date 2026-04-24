import { z } from "zod";

import { successResultSchema } from "../common/result";

export const createCheckoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checkoutUrl: z.string().url(),
  }),
});

export const invoiceDataSchema = z.object({
  invoiceUrl: z.string().url(),
});

export const invoiceResponseSchema = successResultSchema(invoiceDataSchema);
