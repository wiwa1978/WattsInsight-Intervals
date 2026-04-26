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

export function getCheckoutReturnOrigins(args: { appUrl: string; adminAppUrl?: string | null }) {
  return [args.appUrl, args.adminAppUrl]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
}

export function normalizeCheckoutReturnUrl(
  value: string | undefined,
  args: {
    appUrl: string;
    allowedOrigins: string[];
    fallbackPath: string;
  },
) {
  if (!value) {
    return new URL(args.fallbackPath, args.appUrl).toString();
  }

  try {
    const trimmed = value.trim();
    const url = trimmed.startsWith("/") && !trimmed.startsWith("//") ? new URL(trimmed, args.appUrl) : new URL(trimmed);
    const allowedOrigins = new Set(args.allowedOrigins);

    if ((url.protocol !== "http:" && url.protocol !== "https:") || !allowedOrigins.has(url.origin)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export const DODO_CHECKOUT_BASE_URL = {
  live_mode: "https://checkout.dodopayments.com",
  test_mode: "https://test.checkout.dodopayments.com",
} as const;
