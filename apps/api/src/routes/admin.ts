import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import {
  banUserSchema,
  billingListQuerySchema,
  billingRangeQuerySchema,
  discountIdParamSchema,
  discountListQuerySchema,
  discountUserAssignmentSchema,
  generateDiscountCodeSchema,
  logEntriesQuerySchema,
  logFilesQuerySchema,
  notificationsListQuerySchema,
  optionalLimitQuerySchema,
  paginationQuerySchema,
  searchUsersQuerySchema,
  sendNotificationBaseSchema,
  sendNotificationToUsersSchema,
  setRoleSchema,
  setUserPasswordSchema,
  updateDiscountSchema,
  userIdParamSchema,
  userOnlySchema,
  validateDiscountCodeSchema,
  createDiscountSchema,
  createVoucherSchema,
  updateVoucherSchema,
  verifyBanSecretSchema,
  voucherIdParamSchema,
  voucherListQuerySchema,
} from "@platform/contracts";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";
import { forbidden, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { logger } from "../observability/logger";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createAdminRouter() {
  const router = new Hono<AppEnv>();
  type AdminContext = Context<AppEnv>;

  function requireAdminAuthApi() {
    const adminAuthApi = resolveAdminAuthApi(bootstrap.authModule);
    if (!adminAuthApi) {
      throw new Error("Better Auth admin API is unavailable");
    }

    return adminAuthApi;
  }

  async function withJsonBody<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
    emptyBodyFallback: unknown = null,
  ) {
    const body = await c.req.json().catch(() => emptyBodyFallback);
    const parsedBody = parseJsonBody(schema, body);

    if (!parsedBody.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedBody.data);
  }

  function withQuery<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    query: Record<string, string | undefined>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
  ) {
    const parsedQuery = parseQuery(schema, query);

    if (!parsedQuery.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedQuery.data);
  }

  function withParams<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    params: Record<string, string>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
  ) {
    const parsedParams = parseParams(schema, params);

    if (!parsedParams.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedParams.data);
  }

  function withUserIdParam(c: AdminContext, handler: (userId: string) => Response | Promise<Response>) {
    return withParams(c, userIdParamSchema, { userId: c.req.param("userId") ?? "" }, "Invalid user id", ({ userId }) => handler(userId));
  }

  function withDiscountIdParam(c: AdminContext, handler: (discountId: string) => Response | Promise<Response>) {
    return withParams(c, discountIdParamSchema, { discountId: c.req.param("discountId") ?? "" }, "Invalid discount id", ({ discountId }) => handler(discountId));
  }

  function withVoucherIdParam(c: AdminContext, handler: (voucherId: string) => Response | Promise<Response>) {
    return withParams(c, voucherIdParamSchema, { voucherId: c.req.param("voucherId") ?? "" }, "Invalid voucher id", ({ voucherId }) => handler(voucherId));
  }

  function registerAdminAuthJsonAction<T>(
    path: string,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    action: (body: T, headers: Headers) => Promise<unknown>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const result = await action(body, c.req.raw.headers);
        return c.json(result);
      });
    });
  }

  function registerAdminAuthResponseAction<T>(
    path: string,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    fallbackError: string,
    action: (body: T, headers: Headers) => Promise<Response>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const response = await action(body, c.req.raw.headers);
        return createJsonResponseFromAuthResponse(response, fallbackError);
      });
    });
  }

  router.use("/*", bootstrap.authModule.requireAuth);
  router.use("/*", bootstrap.authModule.requireAdminAccess);

  router.get("/session", (c) => {
    return c.json({
      success: true,
      data: getAuthUser(c),
    });
  });

  router.get("/status", async (c) => {
    return c.json({
      success: true,
      data: {
        message: "Admin access granted.",
      },
    });
  });

  router.post("/verify-ban-secret", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(verifyBanSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid secret payload");
    }

    const result = await bootstrap.adminService.verifyAdminBanSecret(parsedBody.data.secret);
    return c.json(result, result.success ? 200 : 400);
  });

  router.get("/dashboard/stats", async (c) => {
    const stats = await bootstrap.adminService.getDashboardStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/users", async (c) => {
    const parsedQuery = parseQuery(paginationQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid users query");
    }

    const users = await bootstrap.adminService.getUsers(parsedQuery.data.limit, parsedQuery.data.offset);
    return c.json({ success: true, data: users });
  });

  registerAdminAuthJsonAction("/users/set-role", setRoleSchema, "Invalid role payload", (body, headers) => {
    return requireAdminAuthApi().setRole({ body, headers });
  });

  registerAdminAuthJsonAction("/users/unban", userOnlySchema, "Invalid unban payload", (body, headers) => {
    return requireAdminAuthApi().unbanUser({ body, headers });
  });

  router.post("/users/ban", (c) => {
    return withJsonBody(c, banUserSchema, "Invalid ban payload", async (body) => {
      const secretResult = await bootstrap.adminService.verifyAdminBanSecret(body.secret);
      if (!secretResult.success) {
        return forbidden(c, secretResult.error ?? "Invalid admin ban secret");
      }

      const { secret: _secret, ...banBody } = body;
      const result = await requireAdminAuthApi().banUser({ body: banBody, headers: c.req.raw.headers });
      return c.json(result);
    });
  });

  registerAdminAuthResponseAction(
    "/users/impersonate",
    userOnlySchema,
    "Invalid impersonation payload",
    "Impersonation failed",
    async (body, headers) => {
      return (await requireAdminAuthApi().impersonateUser({
        body,
        headers,
        asResponse: true,
      })) as Response;
    },
  );

  registerAdminAuthJsonAction("/users/revoke-sessions", userOnlySchema, "Invalid session revoke payload", (body, headers) => {
    return requireAdminAuthApi().revokeUserSessions({ body, headers });
  });

  registerAdminAuthJsonAction("/users/set-password", setUserPasswordSchema, "Invalid password payload", (body, headers) => {
    return requireAdminAuthApi().setUserPassword({ body, headers });
  });

  router.get("/users/stats", async (c) => {
    const stats = await bootstrap.adminService.getUserStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/users/:userId", async (c) => {
    return withUserIdParam(c, async (userId) => {
      const userRecord = await bootstrap.adminService.getUserById(userId);
      if (!userRecord) {
        return c.json({ success: false, error: "User not found" }, 404);
      }

      return c.json({ success: true, data: userRecord });
    });
  });

  router.get("/users/:userId/credits/balance", async (c) => {
    return withUserIdParam(c, async (userId) => {
      const balance = await bootstrap.adminService.getUserCreditBalance(userId);
      return c.json({ success: true, data: balance });
    });
  });

  router.get("/users/:userId/credits/history", async (c) => {
    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid history query", async ({ limit }) => {
        const history = await bootstrap.adminService.getUserCreditHistory(userId, limit);
        return c.json({ success: true, data: history });
      });
    });
  });

  router.get("/users/:userId/credits/purchases", async (c) => {
    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid purchases query", async ({ limit }) => {
        const purchases = await bootstrap.adminService.getUserCreditPurchases(userId, limit);
        return c.json({ success: true, data: purchases });
      });
    });
  });

  router.get("/billing/stats", async (c) => {
    const stats = await bootstrap.adminService.getBillingStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/billing/revenue", async (c) => {
    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getRevenueData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/transactions", async (c) => {
    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid transactions query");
    }

    const data = await bootstrap.adminService.getAllTransactions(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/purchases", async (c) => {
    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid purchases query");
    }

    const data = await bootstrap.adminService.getAllPurchases(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/transactions-chart", async (c) => {
    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getTransactionData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/credits-consumed-chart", async (c) => {
    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getCreditsConsumedData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/discounts", async (c) => {
    const parsedQuery = parseQuery(discountListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid discount query");
    }

    const result = await bootstrap.discountsService.getDiscounts(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.search,
      parsedQuery.data.status,
    );
    return c.json({ success: true, data: result });
  });

  router.get("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      const result = await bootstrap.discountsService.getDiscountById(discountId);
      return c.json(result, result.success ? 200 : 404);
    });
  });

  router.post("/discounts/generate-code", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsedBody = parseJsonBody(generateDiscountCodeSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount code payload");
    }

    try {
      const code = await bootstrap.discountsService.generateDiscountCode(parsedBody.data.overridePrefix);
      return c.json({ success: true, data: { code } });
    } catch (error) {
      return c.json({ success: false, error: error instanceof Error ? error.message : "Failed" }, 400);
    }
  });

  router.post("/discounts/validate-code", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(validateDiscountCodeSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount validation payload");
    }

    const result = await bootstrap.discountsService.validateDiscountCode(parsedBody.data.code, parsedBody.data.excludeId);
    return c.json({ success: true, data: result });
  });

  router.post("/discounts", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createDiscountSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount payload");
    }

    const bodyData = parsedBody.data;
    const result = await bootstrap.discountsService.createDiscount({
      code: bodyData.code,
      type: bodyData.type,
      value: bodyData.value,
      startDate: bodyData.startDate,
      endDate: bodyData.endDate,
      maxUses: bodyData.maxUses,
      userIds: bodyData.userIds,
    });

    return c.json(result, result.success ? 200 : 400);
  });

  router.patch("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      return withJsonBody(c, updateDiscountSchema, "Invalid discount update payload", async (bodyData) => {
        const result = await bootstrap.discountsService.updateDiscount({
          id: discountId,
          code: bodyData.code,
          type: bodyData.type,
          value: bodyData.value,
          startDate: bodyData.startDate,
          endDate: bodyData.endDate,
          maxUses: bodyData.maxUses,
          status: bodyData.status,
        });

        return c.json(result, result.success ? 200 : 400);
      });
    });
  });

  router.delete("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      const result = await bootstrap.discountsService.deleteDiscount(discountId);
      return c.json(result, result.success ? 200 : 400);
    });
  });

  router.post("/discounts/:discountId/assign", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      return withJsonBody(c, discountUserAssignmentSchema, "Invalid discount assignment payload", async (bodyData) => {
        const result = await bootstrap.discountsService.assignDiscountToUsers(discountId, bodyData.userIds);
        return c.json(result, result.success ? 200 : 400);
      });
    });
  });

  router.post("/discounts/:discountId/remove", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      return withJsonBody(c, discountUserAssignmentSchema, "Invalid discount removal payload", async (bodyData) => {
        const result = await bootstrap.discountsService.removeDiscountFromUsers(discountId, bodyData.userIds);
        return c.json(result, result.success ? 200 : 400);
      });
    });
  });

  router.get("/discounts/search-users", async (c) => {
    const parsedQuery = parseQuery(searchUsersQuerySchema, {
      query: c.req.query("query"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid discount search query");
    }

    const users = await bootstrap.discountsService.searchUsersForDiscount(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.get("/vouchers", async (c) => {
    const parsedQuery = parseQuery(voucherListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid voucher query");
    }

    const result = await bootstrap.vouchersService.getVouchers(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.search,
      parsedQuery.data.status,
    );
    return c.json({ success: true, data: result });
  });

  router.get("/vouchers/search-users", async (c) => {
    const parsedQuery = parseQuery(searchUsersQuerySchema, {
      query: c.req.query("query"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid voucher search query");
    }

    const users = await bootstrap.vouchersService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.get("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      const result = await bootstrap.vouchersService.getVoucherById(voucherId);
      return c.json(result, result.success ? 200 : 404);
    });
  });

  router.post("/vouchers", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createVoucherSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid voucher payload");
    }

    const result = await bootstrap.vouchersService.createVoucher(parsedBody.data);
    return c.json(result, result.success ? 200 : 400);
  });

  router.patch("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      return withJsonBody(c, updateVoucherSchema, "Invalid voucher update payload", async (bodyData) => {
        const result = await bootstrap.vouchersService.updateVoucher({
          id: voucherId,
          ...bodyData,
        });
        return c.json(result, result.success ? 200 : 400);
      });
    });
  });

  router.get("/logs/files", async (c) => {
    const parsedQuery = parseQuery(logFilesQuerySchema, {
      stream: c.req.query("stream"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid logs query");
    }

    const files = logger.listLogFiles(parsedQuery.data.stream);
    return c.json({ success: true, data: files });
  });

  router.get("/logs/entries", async (c) => {
    const parsedQuery = parseQuery(logEntriesQuerySchema, {
      stream: c.req.query("stream"),
      file: c.req.query("file"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid log entries query");
    }

    const data = logger.readLogEntries(parsedQuery.data);
    return c.json({ success: true, data });
  });

  router.get("/notifications", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const data = await bootstrap.notificationsService.getAllNotifications(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.post("/notifications/send-all", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationBaseSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const count = await bootstrap.notificationsService.sendNotificationToAllUsers({
      ...parsedBody.data,
    });

    return c.json({ success: true, data: { count } });
  });

  router.post("/notifications/send-users", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationToUsersSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const count = await bootstrap.notificationsService.sendNotificationToUsers({
      ...parsedBody.data,
    });

    return c.json({ success: true, data: { count } });
  });

  return router;
}
