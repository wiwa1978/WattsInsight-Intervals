import { Hono } from "hono";

import { errorCode } from "@platform/contracts";

import { mapDodoEvent } from "./providers/dodo/mapper";
import {
  type WebhookVerifyResult,
  verifyDodoWebhookSignatureDetailed,
} from "./providers/dodo/webhook-verify";
import type { CreatePaymentsModuleOptions } from "./types";

function failureToResponse(reason: Exclude<WebhookVerifyResult, { ok: true }>["reason"]) {
  switch (reason) {
    case "missing_header":
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: "Missing webhook signature header",
          errorCode: errorCode.webhookSignatureMissing,
        },
      };
    case "missing_secret":
      // Misconfiguration on our side. Surface as 500-class to operators but
      // do not leak details to the caller.
      return {
        status: 500 as const,
        body: {
          success: false as const,
          error: "Webhook secret not configured",
          errorCode: errorCode.webhookSignatureMissing,
        },
      };
    case "timestamp_out_of_window":
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: "Webhook timestamp outside tolerance window",
          errorCode: errorCode.webhookTimestampOutOfWindow,
        },
      };
    case "malformed_header":
    case "signature_mismatch":
    default:
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: "Invalid webhook signature",
          errorCode: errorCode.webhookSignatureInvalid,
        },
      };
  }
}

export function createPaymentsModule(options: CreatePaymentsModuleOptions) {
  const router = new Hono();

  router.post("/webhooks/dodo", async (c) => {
    const signatureHeader = c.req.header("x-dodo-signature") ?? null;
    const rawBody = await c.req.text();

    const verification: WebhookVerifyResult = options.verifyDodoWebhook
      ? await (async () => {
          const result = await options.verifyDodoWebhook!(rawBody, signatureHeader);
          // Allow boolean returns from custom verifiers for backward compat.
          if (typeof result === "boolean") {
            return result
              ? ({ ok: true } as const)
              : ({ ok: false, reason: "signature_mismatch" } as const);
          }
          return result;
        })()
      : verifyDodoWebhookSignatureDetailed(
          rawBody,
          signatureHeader,
          options.dodoWebhookSecret,
          { toleranceSeconds: options.dodoWebhookToleranceSeconds },
        );

    if (!verification.ok) {
      const { status, body } = failureToResponse(verification.reason);
      return c.json(body, status);
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
