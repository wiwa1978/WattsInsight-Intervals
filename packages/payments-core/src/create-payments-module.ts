import { Hono } from "hono";

import { mapDodoEvent } from "./providers/dodo/mapper";
import { verifyDodoWebhookSignature } from "./providers/dodo/webhook-verify";
import type { CreatePaymentsModuleOptions } from "./types";

export function createPaymentsModule(options: CreatePaymentsModuleOptions) {
  const router = new Hono();

  router.post("/webhooks/dodo", async (c) => {
    const signatureHeader = c.req.header("x-dodo-signature") ?? null;
    const rawBody = await c.req.text();

    const verified = options.verifyDodoWebhook
      ? await options.verifyDodoWebhook(rawBody, signatureHeader)
      : await verifyDodoWebhookSignature(rawBody, signatureHeader, options.dodoWebhookSecret);

    if (!verified) {
      return c.json({ success: false, error: "Invalid webhook signature" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ success: false, error: "Invalid JSON payload" }, 400);
    }

    const event = mapDodoEvent(payload);
    if (!event) {
      return c.json({ success: false, error: "Unsupported webhook payload" }, 400);
    }

    await options.onPaymentEvent(event);
    return c.json({ success: true, data: { processed: true } }, 200);
  });

  return {
    router,
  };
}
