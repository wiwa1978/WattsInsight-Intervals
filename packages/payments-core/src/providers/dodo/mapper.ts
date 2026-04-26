import { z } from "zod";

import type { NormalizedPaymentEvent } from "../../types";

const paymentSucceededSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.literal("payment.succeeded"),
  data: z.object({
    payment_id: z.string().min(1),
    metadata: z.record(z.string(), z.string()).optional(),
    customer: z
      .object({
        email: z.string().email(),
        customer_id: z.string().min(1).optional(),
      })
      .optional(),
    product_cart: z
      .array(
        z.object({
          product_id: z.string().min(1),
        }),
      )
      .optional(),
    settlement_amount: z.number().optional(),
    total_amount: z.number().optional(),
    settlement_tax: z.number().optional(),
    tax: z.number().optional(),
    settlement_currency: z.string().optional(),
  }),
});

const paymentFailedSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.literal("payment.failed"),
  data: z
    .object({
      payment_id: z.string().min(1).optional(),
    })
    .optional(),
});

const baseSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.string(),
  data: z.unknown().optional(),
});

export function mapDodoEvent(payload: unknown): NormalizedPaymentEvent | null {
  const parsed = baseSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  if (parsed.data.type === "payment.succeeded") {
    const succeeded = paymentSucceededSchema.safeParse(payload);
    if (!succeeded.success) {
      return null;
    }

    const data = succeeded.data.data;
    return {
      provider: "dodo",
      providerEventId: succeeded.data.id ?? succeeded.data.event_id,
      eventType: "payment.succeeded",
      paymentId: data.payment_id,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      productId: data.product_cart?.[0]?.product_id,
      metadata: data.metadata,
      currency: data.settlement_currency,
      totalAmount: data.settlement_amount ?? data.total_amount,
      taxAmount: data.settlement_tax ?? data.tax,
      raw: payload,
    };
  }

  if (parsed.data.type === "payment.failed") {
    const failed = paymentFailedSchema.safeParse(payload);
    if (!failed.success) {
      return null;
    }

    return {
      provider: "dodo",
      providerEventId: failed.data.id ?? failed.data.event_id,
      eventType: "payment.failed",
      paymentId: failed.data.data?.payment_id ?? "unknown",
      raw: payload,
    };
  }

  return null;
}
