/**
 * Build a Dodo checkout URL with userId firmly bound into the payment
 * metadata so the webhook handler can credit the correct account.
 *
 * SECURITY: without this binding, an attacker could trigger payment.succeeded
 * events for arbitrary email addresses and receive credits intended for other
 * users. metadata.userId is the authoritative tie-back to the authenticated
 * session that initiated the checkout — see
 * apps/api/src/modules/billing/payment-event-handler.ts which refuses any
 * webhook missing this field.
 */
export function buildDodoCheckoutUrl(args: {
  baseUrl: string;
  productId: string;
  userId: string;
  packageKey: string;
  customerEmail?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const url = new URL(`${args.baseUrl}/buy/${args.productId}`);
  url.searchParams.set("metadata_userId", args.userId);
  url.searchParams.set("metadata_packageKey", args.packageKey);
  if (args.customerEmail) {
    url.searchParams.set("customer_email", args.customerEmail);
  }
  if (args.successUrl) {
    url.searchParams.set("redirect_url", args.successUrl);
  }
  if (args.cancelUrl) {
    url.searchParams.set("cancel_url", args.cancelUrl);
  }
  return url.toString();
}

export const CHECKOUT_SUCCESS_RETURN_PATH = "/billing?success=true";
export const CHECKOUT_CANCEL_RETURN_PATH = "/billing?cancel=true";

export function buildCheckoutReturnUrl(args: { appUrl: string; path: string }) {
  return new URL(args.path, args.appUrl).toString();
}

export const DODO_CHECKOUT_BASE_URL = {
  live_mode: "https://checkout.dodopayments.com",
  test_mode: "https://test.checkout.dodopayments.com",
} as const;
