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
  verifyDodoWebhook?: (rawBody: string, signatureHeader: string | null) => Promise<boolean> | boolean;
  dodoWebhookSecret?: string;
  onPaymentEvent: PaymentEventHandler;
};
