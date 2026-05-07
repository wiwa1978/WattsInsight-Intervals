export type PaymentProviderName = "dodo";

export type BillingMode = "credits" | "subscriptions";

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
