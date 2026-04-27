import { Hono } from "hono";

import { errorCode } from "@platform/contracts";

import { mapDodoEvent } from "./providers/dodo/mapper";
import {
  type WebhookVerifyResult,
  verifyDodoWebhookSignatureDetailed,
} from "./providers/dodo/webhook-verify";
import type { CreatePaymentsModuleOptions, WebhookFailureAuditEvent } from "./types";

type SafeDodoMetadata = Pick<WebhookFailureAuditEvent, "providerEventId" | "eventType" | "paymentId">;

const SENSITIVE_TOKEN_PATTERN = /\b(?:bearer\s+)?(?:[a-z0-9_-]+\.){2,}[a-z0-9_-]+\b|\b(?:token|secret|password|api[_-]?key)=\S+/gi;

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

function signatureTimestamp(signatureHeader: string | null) {
  const timestamp = signatureHeader
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="))
    ?.slice(2);

  if (!timestamp) {
    return undefined;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return undefined;
  }

  return new Date(timestampSeconds * 1000);
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(SENSITIVE_TOKEN_PATTERN, "[redacted]");
}

function extractSafeDodoMetadata(payload: unknown): SafeDodoMetadata {
  if (!payload || typeof payload !== "object") {
    return { providerEventId: null, eventType: null, paymentId: null };
  }

  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
  return {
    providerEventId: typeof record.id === "string" ? record.id : typeof record.event_id === "string" ? record.event_id : null,
    eventType: typeof record.type === "string" ? record.type : null,
    paymentId: typeof data?.payment_id === "string" ? data.payment_id : null,
  };
}

function tryParseSafeDodoMetadata(rawBody: string): SafeDodoMetadata {
  try {
    return extractSafeDodoMetadata(JSON.parse(rawBody));
  } catch {
    return { providerEventId: null, eventType: null, paymentId: null };
  }
}

async function recordWebhookFailure(
  options: CreatePaymentsModuleOptions,
  metadata: SafeDodoMetadata,
  error: unknown,
) {
  try {
    await options.onWebhookFailure?.({
      provider: "dodo",
      providerEventId: metadata.providerEventId ?? null,
      eventType: metadata.eventType ?? null,
      paymentId: metadata.paymentId ?? null,
      outcome: "failure",
      error: sanitizeError(error),
    });
  } catch {
    // Webhook failure auditing is best-effort and must not alter webhook responses.
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
      await recordWebhookFailure(options, tryParseSafeDodoMetadata(rawBody), verification.reason);
      const { status, body } = failureToResponse(verification.reason);
      return c.json(body, status);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await recordWebhookFailure(options, { providerEventId: null, eventType: null, paymentId: null }, "Invalid JSON payload");
      return c.json({ success: false, error: "Invalid JSON payload" }, 400);
    }

    const event = mapDodoEvent(payload);
    if (!event) {
      await recordWebhookFailure(options, extractSafeDodoMetadata(payload), "Unsupported webhook payload");
      return c.json({ success: false, error: "Unsupported webhook payload" }, 400);
    }

    if (options.webhookEventStore) {
      const providerEventId = event.providerEventId;
      if (!providerEventId) {
        await recordWebhookFailure(options, event, "Missing webhook event id");
        return c.json({ success: false, error: "Missing webhook event id" }, 400);
      }

      const claim = await options.webhookEventStore.claim({
        provider: event.provider,
        providerEventId,
        eventType: event.eventType,
        paymentId: event.paymentId,
        signatureTimestamp: signatureTimestamp(signatureHeader),
      });

      if (!claim.claimed) {
        return c.json({ success: true, data: { processed: false, duplicate: true, status: claim.status } }, 200);
      }

      try {
        await options.onPaymentEvent(event);
        await options.webhookEventStore.markProcessed({ provider: event.provider, providerEventId });
        return c.json({ success: true, data: { processed: true } }, 200);
      } catch (error) {
        await options.webhookEventStore.markFailed({ provider: event.provider, providerEventId, error });
        await recordWebhookFailure(options, event, error);
        throw error;
      }
    }

    try {
      await options.onPaymentEvent(event);
    } catch (error) {
      await recordWebhookFailure(options, event, error);
      throw error;
    }
    return c.json({ success: true, data: { processed: true } }, 200);
  });

  return {
    router,
  };
}
