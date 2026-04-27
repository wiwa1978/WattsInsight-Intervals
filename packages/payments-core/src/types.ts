import type { WebhookVerifyResult } from "./providers/dodo/webhook-verify";

export type NormalizedPaymentEvent = {
  provider: "dodo";
  providerEventId?: string;
  eventType:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.processing"
    | "refund.succeeded"
    | "dispute.opened"
    | "dispute.expired"
    | "dispute.accepted"
    | "dispute.cancelled"
    | "dispute.challenged"
    | "dispute.won"
    | "dispute.lost";
  paymentId: string;
  refundId?: string;
  refundIsPartial?: boolean;
  disputeId?: string;
  disputeStatus?: string;
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

export type WebhookEventProcessingStatus = "processing" | "processed" | "failed";

export type WebhookEventStore = {
  claim: (event: {
    provider: "dodo";
    providerEventId: string;
    eventType: string;
    paymentId?: string;
    signatureTimestamp?: Date;
  }) => Promise<{ claimed: true } | { claimed: false; status: WebhookEventProcessingStatus }>;
  markProcessed: (event: { provider: "dodo"; providerEventId: string }) => Promise<void>;
  markFailed: (event: { provider: "dodo"; providerEventId: string; error: unknown }) => Promise<void>;
};

export type WebhookFailureAuditEvent = {
  provider: "dodo";
  providerEventId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  outcome: "failure";
  error: string;
};

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
  webhookEventStore?: WebhookEventStore;
  onWebhookFailure?: (event: WebhookFailureAuditEvent) => Promise<void> | void;
  onPaymentEvent: PaymentEventHandler;
};
