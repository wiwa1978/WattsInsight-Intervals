import { z } from "zod";

export const createCheckoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checkoutUrl: z.string().url(),
  }),
});
