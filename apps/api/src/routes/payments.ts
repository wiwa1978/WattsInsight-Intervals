import { Hono } from "hono";

import { createCheckoutRequestSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { creditPackages } from "../config/billing";
import { env } from "../env";
import {
  CHECKOUT_CANCEL_RETURN_PATH,
  CHECKOUT_SUCCESS_RETURN_PATH,
  DODO_CHECKOUT_BASE_URL,
  buildDodoCheckoutUrl,
  getCheckoutReturnOrigins,
  normalizeCheckoutReturnUrl,
} from "../lib/dodo-checkout";
import { badRequest, parseJsonBody, validationError } from "../lib/http";

export { buildDodoCheckoutUrl } from "../lib/dodo-checkout";

export function createPaymentsRouter() {
  const router = new Hono<AppEnv>();

  router.route("/payments", bootstrap.paymentsModule.router);

  router.post("/payments/checkout", bootstrap.authModule.requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createCheckoutRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid checkout payload");
    }

    const packageKey = parsedBody.data.packageKey;
    const selectedPackage = creditPackages.find((pkg) => pkg.key === packageKey);
    if (!selectedPackage) {
      return c.json({ success: false, error: "Unknown package" }, 400);
    }

    const authUser = c.get("authUser");
    if (!authUser) {
      // requireAuth middleware should have prevented this, but be defensive.
      return c.json({ success: false, error: "Unauthenticated" }, 401);
    }

    const baseUrl =
      env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
        ? DODO_CHECKOUT_BASE_URL.live_mode
        : DODO_CHECKOUT_BASE_URL.test_mode;
    const allowedReturnOrigins = getCheckoutReturnOrigins({ appUrl: env.APP_URL, adminAppUrl: env.ADMIN_APP_URL });
    const successUrl = normalizeCheckoutReturnUrl(parsedBody.data.successUrl, {
      appUrl: env.APP_URL,
      allowedOrigins: allowedReturnOrigins,
      fallbackPath: CHECKOUT_SUCCESS_RETURN_PATH,
    });
    const cancelUrl = normalizeCheckoutReturnUrl(parsedBody.data.cancelUrl, {
      appUrl: env.APP_URL,
      allowedOrigins: allowedReturnOrigins,
      fallbackPath: CHECKOUT_CANCEL_RETURN_PATH,
    });

    if (!successUrl || !cancelUrl) {
      return badRequest(c, "Invalid checkout return URL");
    }

    const checkoutUrl = buildDodoCheckoutUrl({
      baseUrl,
      productId: selectedPackage.productId,
      userId: authUser.id,
      packageKey,
      customerEmail: authUser.email ?? null,
      successUrl,
      cancelUrl,
    });

    return c.json({ success: true, data: { checkoutUrl } });
  });

  return router;
}
