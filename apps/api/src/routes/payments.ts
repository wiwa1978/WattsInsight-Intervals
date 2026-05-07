import { Hono } from "hono";

import { createCheckoutRequestSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { creditPackages, subscriptionPlans } from "../config/billing";
import { parseJsonBody, validationError } from "../lib/http";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";

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

    const packageKey = "packageKey" in parsedBody.data ? parsedBody.data.packageKey : undefined;
    const planKey = "planKey" in parsedBody.data ? parsedBody.data.planKey : undefined;
    const discountCode = "discountCode" in parsedBody.data ? parsedBody.data.discountCode : undefined;
    const requestMode = "billingMode" in parsedBody.data ? parsedBody.data.billingMode : "credits";

    try {
      if (requestMode === "credits") {
        ensureCreditBillingEnabled();
      } else {
        ensureSubscriptionBillingEnabled();
      }
    } catch (error) {
      const billingModeError = getBillingModeDisabledErrorMessage(error);
      if (billingModeError) {
        return c.json({ success: false, error: billingModeError }, 400);
      }

      throw error;
    }

    const selectedProduct = requestMode === "credits"
      ? creditPackages.find((pkg) => pkg.key === packageKey)
      : subscriptionPlans.find((plan) => plan.key === planKey);
    if (!selectedProduct) {
      return c.json({ success: false, error: requestMode === "credits" ? "Unknown package" : "Unknown plan" }, 400);
    }

    const authUser = c.get("authUser");
    if (!authUser) {
      // requireAuth middleware should have prevented this, but be defensive.
      return c.json({ success: false, error: "Unauthenticated" }, 401);
    }

    const checkoutIntent = await bootstrap.checkoutIntentsService.create({
      userId: authUser.id,
      billingMode: requestMode,
      packageKey,
      planKey,
      productId: selectedProduct.productId,
      discountCode,
      metadata: {
        source: "payments.checkout",
      },
    });

    const checkoutUrl = await bootstrap.paymentProviders.activeProvider.createCheckoutUrl({
      productId: selectedProduct.productId,
      userId: authUser.id,
      billingMode: requestMode,
      ...(requestMode === "credits" ? { packageKey } : { planKey }),
      ...(requestMode === "subscriptions" && discountCode ? { discountCode } : {}),
      referenceId: checkoutIntent.referenceId,
      customerEmail: authUser.email ?? null,
    });

    return c.json({ success: true, data: { checkoutUrl } });
  });

  return router;
}
