import type { WebhookVerifyResult } from "./providers/dodo/webhook-verify";

export type NormalizedPaymentEvent = {
  provider: "dodo";
  eventType: "payment.succeeded" | "payment.failed";
  paymentId: string;
  customerEmail?: string;
  customerId?: string;
  productId?: string;
  metadata?: Record<string, string>;
  currency?: string;
  totalAmount?: number;
  taxAmount?: number;
  raw: unknown;
};

export type PaymentEventHandler = (event: NormalizedPaymentEvent) => Promise<void>;

export type CreatePaymentsModuleOptions = {
  /**
   * Optional override of the default Dodo signature verifier. May return a
   * boolean (legacy) or a {@link WebhookVerifyResult} for richer error codes.
   */
  verifyDodoWebhook?: (
    rawBody: string,
    signatureHeader: string | null,
  ) => Promise<boolean | WebhookVerifyResult> | boolean | WebhookVerifyResult;
  dodoWebhookSecret?: string;
  /** Replay-protection window in seconds. Default 300 (±5 minutes). */
  dodoWebhookToleranceSeconds?: number;
  onPaymentEvent: PaymentEventHandler;
};
