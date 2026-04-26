import { and, eq } from "drizzle-orm";

import type { WebhookEventStore } from "@platform/payments-core";
import { paymentWebhookEvents } from "@platform/platform-db";

type PaymentWebhookEventStoreDeps = {
  db: any;
};

function safeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

export function createPaymentWebhookEventStore(deps: PaymentWebhookEventStoreDeps): WebhookEventStore {
  return {
    async claim(event) {
      const [created] = await deps.db
        .insert(paymentWebhookEvents)
        .values({
          provider: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          paymentId: event.paymentId,
          signatureTimestamp: event.signatureTimestamp,
          processingStatus: "processing",
        })
        .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId] })
        .returning({ id: paymentWebhookEvents.id });

      if (created) {
        return { claimed: true };
      }

      const existing = await deps.db.query.paymentWebhookEvents.findFirst({
        where: and(
          eq(paymentWebhookEvents.provider, event.provider),
          eq(paymentWebhookEvents.providerEventId, event.providerEventId),
        ),
      });

      if (existing?.processingStatus === "failed") {
        const [claimed] = await deps.db
          .update(paymentWebhookEvents)
          .set({
            eventType: event.eventType,
            paymentId: event.paymentId,
            signatureTimestamp: event.signatureTimestamp,
            processingStatus: "processing",
            errorDetails: null,
            failedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentWebhookEvents.provider, event.provider),
              eq(paymentWebhookEvents.providerEventId, event.providerEventId),
              eq(paymentWebhookEvents.processingStatus, "failed"),
            ),
          )
          .returning({ id: paymentWebhookEvents.id });

        if (claimed) {
          return { claimed: true };
        }
      }

      return { claimed: false, status: existing?.processingStatus ?? "processing" };
    },

    async markProcessed(event) {
      await deps.db
        .update(paymentWebhookEvents)
        .set({
          processingStatus: "processed",
          processedAt: new Date(),
          failedAt: null,
          errorDetails: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, event.provider),
            eq(paymentWebhookEvents.providerEventId, event.providerEventId),
          ),
        );
    },

    async markFailed(event) {
      await deps.db
        .update(paymentWebhookEvents)
        .set({
          processingStatus: "failed",
          failedAt: new Date(),
          errorDetails: safeErrorDetails(event.error),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, event.provider),
            eq(paymentWebhookEvents.providerEventId, event.providerEventId),
          ),
        );
    },
  };
}
