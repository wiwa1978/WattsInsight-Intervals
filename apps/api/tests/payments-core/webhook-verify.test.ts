import { createHmac } from "node:crypto";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createPaymentsModule } from "@platform/payments-core";
import {
  DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS,
  type NormalizedPaymentEvent,
  verifyDodoWebhookSignatureDetailed,
} from "@platform/payments-core";

const SECRET = "whsec_test_dodo_super_secret_value";

function sign(body: string, timestampSeconds: number, secret = SECRET) {
  const signedPayload = `${timestampSeconds}.${body}`;
  const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return { header: `t=${timestampSeconds},v1=${v1}`, v1 };
}

const samplePayload = JSON.stringify({
  type: "payment.succeeded",
  data: {
    payment_id: "pay_test_123",
    customer: { email: "buyer@example.com" },
    product_cart: [{ product_id: "prod_credits_100" }],
    metadata: { userId: "11111111-1111-1111-1111-111111111111" },
    settlement_amount: 1000,
    settlement_tax: 100,
    settlement_currency: "EUR",
  },
});

describe("verifyDodoWebhookSignatureDetailed", () => {
  const fixedNow = new Date("2026-04-24T12:00:00Z");
  const t = Math.floor(fixedNow.getTime() / 1000);

  it("missing_secret when secret is undefined", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "t=1,v1=x", undefined);
    expect(r).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("missing_header when no signature header", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", null, SECRET);
    expect(r).toEqual({ ok: false, reason: "missing_header" });
  });

  it("malformed_header when header lacks t/v1", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "garbage", SECRET);
    expect(r).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("malformed_header when timestamp is not a number", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "t=NaN,v1=abc", SECRET);
    expect(r).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("timestamp_out_of_window when older than tolerance", () => {
    const stale = t - DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS - 1;
    const { header } = sign(samplePayload, stale);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("timestamp_out_of_window when too far in the future", () => {
    const future = t + DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS + 1;
    const { header } = sign(samplePayload, future);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("signature_mismatch when body has been tampered with", () => {
    const { header } = sign(samplePayload, t);
    const r = verifyDodoWebhookSignatureDetailed(
      samplePayload + "x",
      header,
      SECRET,
      { now: () => fixedNow },
    );
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("signature_mismatch when secret has been rotated", () => {
    const { header } = sign(samplePayload, t, "wrong-secret");
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("ok for a correctly signed, in-window payload", () => {
    const { header } = sign(samplePayload, t);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: true });
  });

  it("rejects a previously-valid header replayed long after the fact", () => {
    const { header } = sign(samplePayload, t);
    const muchLater = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => muchLater,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });
});

describe("POST /webhooks/dodo response codes", () => {
  function build(opts?: Partial<Parameters<typeof createPaymentsModule>[0]>) {
    const onPaymentEvent = vi.fn<(event: NormalizedPaymentEvent) => Promise<void>>(
      async () => {},
    );
    const module = createPaymentsModule({
      dodoWebhookSecret: SECRET,
      onPaymentEvent,
      ...opts,
    });
    const app = new Hono();
    app.route("/", module.router);
    return { app, onPaymentEvent };
  }

  it("401 WEBHOOK_SIGNATURE_MISSING with no header", async () => {
    const { app, onPaymentEvent } = build();
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "WEBHOOK_SIGNATURE_MISSING",
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 WEBHOOK_SIGNATURE_INVALID with malformed header", async () => {
    const { app, onPaymentEvent } = build();
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "garbage" },
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "WEBHOOK_SIGNATURE_INVALID",
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 WEBHOOK_TIMESTAMP_OUT_OF_WINDOW for a stale payload", async () => {
    const { app, onPaymentEvent } = build();
    const stale = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago
    const { header } = sign(samplePayload, stale);
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "WEBHOOK_TIMESTAMP_OUT_OF_WINDOW",
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 WEBHOOK_SIGNATURE_INVALID when body bytes differ from signed payload", async () => {
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);
    const tampered = samplePayload.replace("1000", "999999");
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: tampered,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "WEBHOOK_SIGNATURE_INVALID",
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("200 invokes onPaymentEvent for a valid signed payload", async () => {
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(onPaymentEvent).toHaveBeenCalledOnce();
    const firstCall = onPaymentEvent.mock.calls[0];
    expect(firstCall?.[0]).toMatchObject({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_test_123",
    });
  });

  it("legacy boolean-returning verifier still works (backward compat)", async () => {
    const { app } = build({
      verifyDodoWebhook: () => true,
    });
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "anything" },
      body: samplePayload,
    });
    expect(res.status).toBe(200);
  });
});
