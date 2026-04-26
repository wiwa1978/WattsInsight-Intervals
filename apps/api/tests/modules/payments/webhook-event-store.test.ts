import { describe, expect, it, vi } from "vitest";

import { paymentWebhookEvents } from "@platform/platform-db";

import { createPaymentWebhookEventStore } from "../../../src/modules/payments/webhook-event-store";

describe("createPaymentWebhookEventStore", () => {
  it("claims new webhook events", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const db = {
      insert: vi.fn().mockReturnValue({ values }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    const result = await store.claim({
      provider: "dodo",
      providerEventId: "evt_1",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      signatureTimestamp: new Date("2026-04-26T12:00:00Z"),
    });

    expect(result).toEqual({ claimed: true });
    expect(db.insert).toHaveBeenCalledWith(paymentWebhookEvents);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      provider: "dodo",
      providerEventId: "evt_1",
      processingStatus: "processing",
    }));
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId],
    });
  });

  it("does not claim already processed events", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        paymentWebhookEvents: {
          findFirst: vi.fn().mockResolvedValue({ processingStatus: "processed" }),
        },
      },
      update: vi.fn(),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await expect(
      store.claim({ provider: "dodo", providerEventId: "evt_1", eventType: "payment.succeeded", paymentId: "pay_1" }),
    ).resolves.toEqual({ claimed: false, status: "processed" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reclaims failed events for retry", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        paymentWebhookEvents: {
          findFirst: vi.fn().mockResolvedValue({ processingStatus: "failed" }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: updateReturning }),
        }),
      }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await expect(
      store.claim({ provider: "dodo", providerEventId: "evt_1", eventType: "payment.succeeded", paymentId: "pay_1" }),
    ).resolves.toEqual({ claimed: true });
    expect(db.update).toHaveBeenCalledWith(paymentWebhookEvents);
  });

  it("marks failed events with sanitized error details", async () => {
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await store.markFailed({ provider: "dodo", providerEventId: "evt_1", error: new Error("provider exploded") });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      processingStatus: "failed",
      errorDetails: {
        name: "Error",
        message: "provider exploded",
      },
    }));
  });
});
