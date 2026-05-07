import type DodoPayments from "dodopayments";

import {
  CHECKOUT_CANCEL_RETURN_PATH,
  CHECKOUT_SUCCESS_RETURN_PATH,
  DODO_CHECKOUT_BASE_URL,
  buildCheckoutReturnUrl,
  buildDodoCheckoutUrl,
} from "../../../lib/dodo-checkout";
import { isProviderTimeout, withProviderTimeout } from "../../../lib/provider-fetch";
import type { PaymentProvider } from "../provider";

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

function dodoApiBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

function checkoutBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? DODO_CHECKOUT_BASE_URL.live_mode : DODO_CHECKOUT_BASE_URL.test_mode;
}

function invoiceUrlFromResponse(invoiceData: DodoInvoiceResponse) {
  return invoiceData.invoice_pdf ?? invoiceData.invoice_url ?? invoiceData.url;
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
      if (!options.apiKey) {
        throw new Error("Payment provider API key not configured");
      }

      let response: Response;
      try {
        response = await fetch(
          `${dodoApiBaseUrl(options.environment)}/invoices/payments/${paymentId}`,
          withProviderTimeout({
            method: "GET",
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
            },
          }),
        );
      } catch (error) {
        throw new Error(isProviderTimeout(error) ? "Invoice provider request timed out" : "Invoice provider request failed");
      }

      if (!response.ok) {
        throw new Error("Invoice provider request failed");
      }

      const invoiceData = (await response.json()) as DodoInvoiceResponse;
      const invoiceUrl = invoiceUrlFromResponse(invoiceData);
      if (!invoiceUrl) {
        throw new Error("Invoice URL not available in API response");
      }

      return { invoiceUrl, invoiceData };
    },
  };
}
