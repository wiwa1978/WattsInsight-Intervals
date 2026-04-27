import { Hono } from "hono";
import type { Context } from "hono";

import {
  invoiceRequestSchema,
  notificationIdParamSchema,
  optionalLimitQuerySchema,
  redeemVoucherSchema,
} from "@platform/contracts/wire";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { ok, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createMeRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/session", (c) => {
    return ok(c, getAuthUser(c));
  });

  router.get("/credits/balance", async (c) => {
    const authUser = getAuthUser(c);
    const balance = await bootstrap.billingService.getCreditBalance(authUser.id);
    return c.json({ success: true, data: balance });
  });

  router.get("/credits/history", async (c) => {
    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid history query");
    }

    const history = await bootstrap.billingService.getCreditHistory(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: history });
  });

  router.get("/credits/purchases", async (c) => {
    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid purchases query");
    }

    const purchases = await bootstrap.billingService.getCreditPurchases(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: purchases });
  });

  router.post("/credits/invoice", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(invoiceRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid invoice payload");
    }

    try {
      const invoice = await bootstrap.billingService.downloadInvoice(authUser.id, parsedBody.data.paymentId);
      return c.json(invoice);
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to download invoice",
        },
        400,
      );
    }
  });

  router.post("/vouchers/redeem", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(redeemVoucherSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid voucher payload");
    }

    const result = await bootstrap.vouchersService.redeemVoucher(authUser.id, parsedBody.data.code);
    return c.json(result, result.success ? 200 : 400);
  });

  router.get("/notifications", async (c) => {
    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const list = await bootstrap.notificationsService.listForUser(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: list });
  });

  router.get("/notifications/unread-count", async (c) => {
    const authUser = getAuthUser(c);
    const count = await bootstrap.notificationsService.unreadCount(authUser.id);
    return c.json({ success: true, data: { count } });
  });

  router.get("/notifications/active-banner", async (c) => {
    const authUser = getAuthUser(c);
    const banner = await bootstrap.notificationsService.getActiveBannerForUser(authUser.id);
    return c.json({ success: true, data: banner });
  });

  router.post("/notifications/:notificationId/read", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await bootstrap.notificationsService.markAsRead(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { marked: true } });
  });

  router.delete("/notifications/:notificationId", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await bootstrap.notificationsService.deleteNotification(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { deleted: true } });
  });

  router.post("/notifications/read-all", async (c) => {
    const authUser = getAuthUser(c);
    await bootstrap.notificationsService.markAllAsRead(authUser.id);
    return c.json({ success: true, data: { marked: true } });
  });

  return router;
}
