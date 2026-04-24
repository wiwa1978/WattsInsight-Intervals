import { Hono } from "hono";

import { createCheckoutRequestSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { creditPackages } from "../config/billing";
import { env } from "../env";
import { parseJsonBody, validationError } from "../lib/http";

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

    const checkoutBaseUrl =
      env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
        ? "https://checkout.dodopayments.com"
        : "https://test.checkout.dodopayments.com";

    const checkoutUrl = `${checkoutBaseUrl}/buy/${selectedPackage.productId}`;
    return c.json({ success: true, data: { checkoutUrl } });
  });

  return router;
}
