export type PaymentProviderName = "dodo";

export type BillingMode = "credits" | "subscriptions";
export type ProviderPaymentStatus = "completed" | "pending" | "failed" | "refunded" | string;
export type ProviderSubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "paused" | string;

export type ProviderListParams = {
  pageSize?: number;
  cursor?: string;
};

export type CreateCheckoutInput = {
  productId: string;
  userId: string;
  billingMode: BillingMode;
  packageKey?: string;
  planKey?: string;
  referenceId?: string;
  discountCode?: string;
  customerEmail?: string | null;
  successUrl?: string;
  cancelUrl?: string;
};

export type InvoiceResult = {
  invoiceUrl: string;
  invoiceData?: unknown;
};

export type CustomerPortalInput = {
  customerId: string;
  returnUrl: string;
};

export type CustomerPortalResult = {
  portalUrl: string;
};

export type CreateRefundInput = {
  paymentId: string;
  reason?: string | null;
  metadata?: Record<string, string>;
  idempotencyKey?: string | null;
};

export type RefundResult = {
  refundId: string;
  paymentId: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  raw?: unknown;
};

export type ProviderPaymentListItem = {
  paymentId: string;
  status?: ProviderPaymentStatus | null;
  raw?: unknown;
};

export type ProviderSubscriptionListItem = {
  subscriptionId: string;
  status?: ProviderSubscriptionStatus | null;
  raw?: unknown;
};

export type ProviderListResult<T> = {
  items: T[];
  nextCursor?: string | null;
};

export type PaymentProviderFinance = {
  listPayments(params?: ProviderListParams): Promise<ProviderListResult<ProviderPaymentListItem>>;
  listSubscriptions(params?: ProviderListParams): Promise<ProviderListResult<ProviderSubscriptionListItem>>;
};

export type PaymentProviderCapabilities = {
  checkout: boolean;
  customerPortal: boolean;
  invoices: boolean;
  refunds: boolean;
  finance: boolean;
};

export type PaymentProvider = {
  name: PaymentProviderName;
  capabilities: PaymentProviderCapabilities;
  createCheckoutUrl(input: CreateCheckoutInput): Promise<string> | string;
  createCustomerPortal?(input: CustomerPortalInput): Promise<CustomerPortalResult>;
  getInvoice?(paymentId: string): Promise<InvoiceResult>;
  createRefund?(input: CreateRefundInput): Promise<RefundResult>;
  finance?: PaymentProviderFinance;
};

export type PaymentProviderRegistry = {
  activeProvider: PaymentProvider;
  getProvider(name?: PaymentProviderName): PaymentProvider;
};

export function createPaymentProviderRegistry(activeProvider: PaymentProvider): PaymentProviderRegistry {
  const providers = new Map<PaymentProviderName, PaymentProvider>([[activeProvider.name, activeProvider]]);

  return {
    activeProvider,
    getProvider(name = activeProvider.name) {
      const provider = providers.get(name);
      if (!provider) {
        throw new Error(`Payment provider is not configured: ${name}`);
      }

      return provider;
    },
  };
}
