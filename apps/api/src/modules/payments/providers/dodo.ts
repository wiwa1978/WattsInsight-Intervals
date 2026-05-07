import type DodoPayments from "dodopayments";

import {
  CHECKOUT_CANCEL_RETURN_PATH,
  CHECKOUT_SUCCESS_RETURN_PATH,
  DODO_CHECKOUT_BASE_URL,
  buildCheckoutReturnUrl,
  buildDodoCheckoutUrl,
} from "../../../lib/dodo-checkout";
import { isProviderTimeout, withProviderTimeout } from "../../../lib/provider-fetch";
import type { PaymentProvider, ProviderListParams } from "../provider";

type DodoPaymentProviderOptions = {
  apiKey?: string;
  environment: "test_mode" | "live_mode";
  appUrl: string;
  client?: DodoPayments | null;
};

type DodoInvoiceResponse = {
  invoice_pdf?: string;
  invoice_url?: string;
  url?: string;
};

type DodoRefundResponse = {
  refund_id: string;
  payment_id: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
};

type DodoListResponse<T> = {
  items?: T[];
  next_cursor?: string | null;
  nextCursor?: string | null;
};

type DodoPaymentListItem = {
  payment_id: string;
  status?: string | null;
};

type DodoSubscriptionListItem = {
  subscription_id: string;
  status?: string | null;
};

function dodoApiBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

function checkoutBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? DODO_CHECKOUT_BASE_URL.live_mode : DODO_CHECKOUT_BASE_URL.test_mode;
}

function invoiceUrlFromResponse(invoiceData: DodoInvoiceResponse) {
  return invoiceData.invoice_pdf ?? invoiceData.invoice_url ?? invoiceData.url;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function dodoListParams(params?: ProviderListParams) {
  return toQueryString({
    page_size: params?.pageSize,
    cursor: params?.cursor,
  });
}

async function dodoApiRequest<T>(
  options: DodoPaymentProviderOptions,
  path: string,
  timeoutMessage: string,
  init?: RequestInit,
): Promise<T> {
  if (!options.apiKey) {
    throw new Error("Payment provider API key not configured");
  }

  let response: Response;
  try {
    response = await fetch(
      `${dodoApiBaseUrl(options.environment)}${path}`,
      withProviderTimeout({
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      }),
    );
  } catch (error) {
    throw new Error(isProviderTimeout(error) ? timeoutMessage : "Payment provider request failed");
  }

  if (!response.ok) {
    throw new Error("Payment provider request failed");
  }

  return response.json() as Promise<T>;
}

export function createDodoPaymentProvider(options: DodoPaymentProviderOptions): PaymentProvider {
  return {
    name: "dodo",
    capabilities: {
      checkout: true,
      customerPortal: Boolean(options.client?.customers?.customerPortal),
      invoices: Boolean(options.apiKey),
      refunds: Boolean(options.apiKey),
      finance: Boolean(options.apiKey),
    },
    createCheckoutUrl(input) {
      return buildDodoCheckoutUrl({
        baseUrl: checkoutBaseUrl(options.environment),
        productId: input.productId,
        userId: input.userId,
        billingMode: input.billingMode,
        packageKey: input.packageKey,
        planKey: input.planKey,
        referenceId: input.referenceId,
        discountCode: input.discountCode,
        customerEmail: input.customerEmail,
        successUrl: input.successUrl ?? buildCheckoutReturnUrl({ appUrl: options.appUrl, path: CHECKOUT_SUCCESS_RETURN_PATH }),
        cancelUrl: input.cancelUrl ?? buildCheckoutReturnUrl({ appUrl: options.appUrl, path: CHECKOUT_CANCEL_RETURN_PATH }),
      });
    },
    async createCustomerPortal(input) {
      const portal = options.client?.customers?.customerPortal;
      if (!portal) {
        throw new Error("Customer portal is not configured");
      }

      const session = await portal.create(input.customerId, {
        return_url: input.returnUrl,
      });

      if (!session?.link) {
        throw new Error("Customer portal URL not available");
      }

      return { portalUrl: session.link };
    },
    async getInvoice(paymentId) {
      const invoiceData = await dodoApiRequest<DodoInvoiceResponse>(options, `/invoices/payments/${paymentId}`, "Invoice provider request timed out");
      const invoiceUrl = invoiceUrlFromResponse(invoiceData);
      if (!invoiceUrl) {
        throw new Error("Invoice URL not available in API response");
      }

      return { invoiceUrl, invoiceData };
    },
    async createRefund(input) {
      const refund = await dodoApiRequest<DodoRefundResponse>(
        options,
        "/refunds",
        "Refund provider request timed out",
        {
          method: "POST",
          headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
          body: JSON.stringify({
            payment_id: input.paymentId,
            reason: input.reason ?? undefined,
            metadata: input.metadata,
          }),
        },
      );

      return {
        refundId: refund.refund_id,
        paymentId: refund.payment_id,
        status: refund.status,
        amount: refund.amount ?? null,
        currency: refund.currency ?? null,
        raw: refund,
      };
    },
    finance: options.apiKey
      ? {
          async listPayments(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoPaymentListItem>>(
              options,
              `/payments${dodoListParams(params)}`,
              "Payment provider finance request timed out",
            );
            return {
              items: (data.items ?? []).map((payment) => ({
                paymentId: payment.payment_id,
                status: payment.status,
                raw: payment,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listSubscriptions(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoSubscriptionListItem>>(
              options,
              `/subscriptions${dodoListParams(params)}`,
              "Payment provider finance request timed out",
            );
            return {
              items: (data.items ?? []).map((subscription) => ({
                subscriptionId: subscription.subscription_id,
                status: subscription.status,
                raw: subscription,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
        }
      : undefined,
  };
}
