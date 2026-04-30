import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import {
  banUserSchema,
  billingListQuerySchema,
  billingRangeQuerySchema,
  discountIdParamSchema,
  discountListQuerySchema,
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
  webhookEventIdParamSchema,
  webhookEventsQuerySchema,
} from "@platform/contracts";
import { paymentWebhookEvents } from "@platform/platform-db";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { forbidden, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { getAuditRequestContext } from "../modules/audit/service";
import { logger } from "../observability/logger";

type NotificationSendResultWithBatch = {
  sentCount: number;
  skippedCount: number;
  invalidRecipientCount: number;
  invalidRecipientIds: string[];
  batchId?: string | null;
};

type AdminAuthAuditDetails<T> = {
  action: string;
  targetType: string;
  targetId: (body: T) => string | null;
  after?: (body: T) => unknown;
  metadata?: (body: T) => unknown;
};

const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

function billingModeErrorResponse(c: Context<AppEnv>, error: unknown) {
  const billingModeError = getBillingModeDisabledErrorMessage(error);
  if (billingModeError) {
    return c.json({ success: false, error: billingModeError }, 400);
  }

  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publicNotificationSendResult(result: NotificationSendResultWithBatch) {
  return {
    sentCount: result.sentCount,
    skippedCount: result.skippedCount,
    invalidRecipientCount: result.invalidRecipientCount,
    invalidRecipientIds: result.invalidRecipientIds,
  };
}

function safeDiscountSummary(value: unknown) {
  if (!isRecord(value)) return null;

  return {
    id: typeof value.id === "string" ? value.id : null,
    code: typeof value.code === "string" ? value.code : null,
    type: typeof value.type === "string" ? value.type : null,
    value: typeof value.value === "number" || typeof value.value === "string" ? value.value : null,
    status: typeof value.status === "string" ? value.status : null,
    maxUses: typeof value.maxUses === "number" || value.maxUses === null ? value.maxUses : null,
    currentUses: typeof value.currentUses === "number" ? value.currentUses : null,
  };
}

function safeVoucherSummary(value: unknown) {
  if (!isRecord(value)) return null;

  return {
    id: typeof value.id === "string" ? value.id : null,
    code: typeof value.code === "string" ? value.code : null,
    creditAmount: typeof value.creditAmount === "number" ? value.creditAmount : null,
    status: typeof value.status === "string" ? value.status : null,
    maxRedemptions: typeof value.maxRedemptions === "number" || value.maxRedemptions === null ? value.maxRedemptions : null,
    currentRedemptions: typeof value.currentRedemptions === "number" ? value.currentRedemptions : null,
    appliesToAllUsers: typeof value.appliesToAllUsers === "boolean" ? value.appliesToAllUsers : null,
  };
}

function resultField(result: unknown, field: string) {
  return isRecord(result) ? result[field] : undefined;
}

function resultError(result: unknown, fallback: string) {
  const error = resultField(result, "error");
  return typeof error === "string" ? error : fallback;
}

function safeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function publicMutationResult(result: unknown, internalFields: string[]) {
  if (!isRecord(result)) return result;

  const publicResult = { ...result };
  for (const field of internalFields) {
    delete publicResult[field];
  }
  return publicResult;
}

function isSuccessfulMutationResult(result: unknown) {
  return !isRecord(result) || result.success !== false;
}

function notificationSendHistoryItem(entry: Record<string, unknown>) {
  const after = isRecord(entry.after) ? entry.after : {};
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const scope = after.scope === "selected" ? "selected" : "all";
  const invalidRecipientIds = Array.isArray(metadata.invalidRecipientIds)
    ? metadata.invalidRecipientIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: stringValue(entry.id),
    action: stringValue(entry.action),
    batchId: typeof entry.targetId === "string" ? entry.targetId : null,
    actorId: typeof entry.actorId === "string" ? entry.actorId : null,
    scope,
    title: stringValue(after.title),
    message: stringValue(after.message),
    sentCount: numberValue(metadata.sentCount),
    skippedCount: numberValue(metadata.skippedCount),
    invalidRecipientCount: numberValue(metadata.invalidRecipientCount),
    invalidRecipientIds,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : stringValue(entry.createdAt),
  };
}

type WebhookEventRow = typeof paymentWebhookEvents.$inferSelect;

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicWebhookEvent(event: WebhookEventRow) {
  return {
    id: event.id,
    provider: event.provider,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    paymentId: event.paymentId,
    signatureTimestamp: isoDate(event.signatureTimestamp),
    processingStatus: event.processingStatus,
    errorDetails: event.errorDetails ?? null,
    processedAt: isoDate(event.processedAt),
    failedAt: isoDate(event.failedAt),
    createdAt: isoDate(event.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(event.updatedAt) ?? new Date(0).toISOString(),
  };
}

function parseOptionalDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWebhookEventWhere(filters: {
  provider?: string;
  status?: "processing" | "processed" | "failed";
  eventType?: string;
  paymentId?: string;
  text?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const conditions: SQL[] = [];

  if (filters.provider) conditions.push(eq(paymentWebhookEvents.provider, filters.provider));
  if (filters.status) conditions.push(eq(paymentWebhookEvents.processingStatus, filters.status));
  if (filters.eventType) conditions.push(ilike(paymentWebhookEvents.eventType, `%${filters.eventType}%`));
  if (filters.paymentId) conditions.push(ilike(paymentWebhookEvents.paymentId, `%${filters.paymentId}%`));
  if (filters.text) {
    conditions.push(
      or(
        ilike(paymentWebhookEvents.provider, `%${filters.text}%`),
        ilike(paymentWebhookEvents.providerEventId, `%${filters.text}%`),
        ilike(paymentWebhookEvents.eventType, `%${filters.text}%`),
        ilike(paymentWebhookEvents.paymentId, `%${filters.text}%`),
      )!,
    );
  }

  const dateFrom = parseOptionalDate(filters.dateFrom);
  if (dateFrom) conditions.push(gte(paymentWebhookEvents.createdAt, dateFrom));

  const dateTo = parseOptionalDate(filters.dateTo);
  if (dateTo) conditions.push(lte(paymentWebhookEvents.createdAt, dateTo));

  return conditions.length > 0 ? and(...conditions) : undefined;
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

  async function recordAdminAuthAudit<T>(c: AdminContext, body: T, details: AdminAuthAuditDetails<T>) {
    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      action: details.action,
      outcome: "success",
      targetType: details.targetType,
      targetId: details.targetId(body),
      after: details.after?.(body),
      metadata: details.metadata?.(body),
    }).catch(() => undefined);
  }

  async function recordMutationAudit(
    c: AdminContext,
    input: {
      action: string;
      outcome: "success" | "failure";
      targetType: string;
      targetId: string | null;
      before?: unknown;
      after?: unknown;
      metadata?: unknown;
    },
  ) {
    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      ...input,
    }).catch(() => undefined);
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
    auditDetails?: AdminAuthAuditDetails<T>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const result = await action(body, c.req.raw.headers);
        if (auditDetails && isSuccessfulMutationResult(result)) {
          await recordAdminAuthAudit(c, body, auditDetails);
        }
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
    auditDetails?: AdminAuthAuditDetails<T>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const response = await action(body, c.req.raw.headers);
        const jsonResponse = await createJsonResponseFromAuthResponse(response, fallbackError);
        const payload = await jsonResponse.clone().json().catch(() => null);
        if (auditDetails && jsonResponse.ok && isSuccessfulMutationResult(payload)) {
          await recordAdminAuthAudit(c, body, auditDetails);
        }
        return jsonResponse;
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
    const parsedQuery = parseQuery(adminUsersQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid users query");
    }

    const trimmedSearch = parsedQuery.data.search?.trim();
    const users = await bootstrap.adminService.getUsers(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      trimmedSearch || undefined,
    );
    return c.json({ success: true, data: users });
  });

  registerAdminAuthJsonAction("/users/set-role", setRoleSchema, "Invalid role payload", (body, headers) => {
    return requireAdminAuthApi().setRole({ body, headers });
  }, {
    action: "admin.user.set_role",
    targetType: "user",
    targetId: (body) => body.userId,
    after: (body) => ({ role: body.role }),
  });

  registerAdminAuthJsonAction("/users/unban", userOnlySchema, "Invalid unban payload", (body, headers) => {
    return requireAdminAuthApi().unbanUser({ body, headers });
  }, {
    action: "admin.user.unban",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ banned: false }),
  });

  router.post("/users/ban", (c) => {
    return withJsonBody(c, banUserSchema, "Invalid ban payload", async (body) => {
      const secretResult = await bootstrap.adminService.verifyAdminBanSecret(body.secret);
      if (!secretResult.success) {
        return forbidden(c, secretResult.error ?? "Invalid admin ban secret");
      }

      const { secret: _secret, ...banBody } = body;
      const result = await requireAdminAuthApi().banUser({ body: banBody, headers: c.req.raw.headers });
      if (isSuccessfulMutationResult(result)) {
        await recordAdminAuthAudit(c, banBody, {
          action: "admin.user.ban",
          targetType: "user",
          targetId: (body) => body.userId,
          after: (body) => ({ banned: true, ...body }),
        });
      }
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
    {
      action: "admin.impersonation.start",
      targetType: "user",
      targetId: (body) => body.userId,
    },
  );

  registerAdminAuthJsonAction("/users/revoke-sessions", userOnlySchema, "Invalid session revoke payload", (body, headers) => {
    return requireAdminAuthApi().revokeUserSessions({ body, headers });
  }, {
    action: "admin.user.revoke_sessions",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ sessionsRevoked: true }),
  });

  registerAdminAuthJsonAction("/users/set-password", setUserPasswordSchema, "Invalid password payload", (body, headers) => {
    return requireAdminAuthApi().setUserPassword({ body, headers });
  }, {
    action: "admin.user.set_password",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ passwordUpdated: true }),
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
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      const balance = await bootstrap.adminService.getUserCreditBalance(userId);
      return c.json({ success: true, data: balance });
    });
  });

  router.get("/users/:userId/credits/history", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid history query", async ({ limit }) => {
        const history = await bootstrap.adminService.getUserCreditHistory(userId, limit);
        return c.json({ success: true, data: history });
      });
    });
  });

  router.get("/users/:userId/credits/purchases", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid purchases query", async ({ limit }) => {
        const purchases = await bootstrap.adminService.getUserCreditPurchases(userId, limit);
        return c.json({ success: true, data: purchases });
      });
    });
  });

  router.get("/billing/stats", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const stats = await bootstrap.adminService.getBillingStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/billing/revenue", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getRevenueData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/transactions", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

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
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

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
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getTransactionData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/credits-consumed-chart", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getCreditsConsumedData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/users/:userId/subscription", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      const subscription = await bootstrap.subscriptionService.getUserSubscription(userId);
      return c.json({ success: true, data: subscription ?? null });
    });
  });

  router.get("/billing/subscriptions", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscriptions query");
    }

    const data = await bootstrap.subscriptionService.listSubscriptions(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-stats", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await bootstrap.subscriptionService.getSubscriptionStats();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-plan-distribution", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await bootstrap.subscriptionService.getPlanDistribution();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-events", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscription events query");
    }

    const data = await bootstrap.subscriptionService.listSubscriptionEvents(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.get("/webhooks", async (c) => {
    const parsedQuery = parseQuery(webhookEventsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      provider: c.req.query("provider"),
      status: c.req.query("status"),
      eventType: c.req.query("eventType"),
      paymentId: c.req.query("paymentId"),
      text: c.req.query("text"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid webhook events query");
    }

    const where = buildWebhookEventWhere(parsedQuery.data);
    const [events, totalRows] = await Promise.all([
      bootstrap.db.query.paymentWebhookEvents.findMany({
        where,
        orderBy: desc(paymentWebhookEvents.createdAt),
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      }),
      bootstrap.db.select({ count: count() }).from(paymentWebhookEvents).where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return c.json({ success: true, data: { events: events.map(publicWebhookEvent), total } });
  });

  router.get("/webhooks/stats", async (c) => {
    const rows = await bootstrap.db
      .select({ processingStatus: paymentWebhookEvents.processingStatus, count: count() })
      .from(paymentWebhookEvents)
      .groupBy(paymentWebhookEvents.processingStatus);

    const stats = { total: 0, processing: 0, processed: 0, failed: 0 };
    for (const row of rows) {
      const status = row.processingStatus;
      const value = Number(row.count ?? 0);
      if (status === "processing" || status === "processed" || status === "failed") {
        stats[status] = value;
        stats.total += value;
      }
    }

    return c.json({ success: true, data: stats });
  });

  router.get("/webhooks/:eventId", async (c) => {
    return withParams(
      c,
      webhookEventIdParamSchema,
      { eventId: c.req.param("eventId") ?? "" },
      "Invalid webhook event id",
      async ({ eventId }) => {
        const event = await bootstrap.db.query.paymentWebhookEvents.findFirst({
          where: eq(paymentWebhookEvents.id, eventId),
        });

        if (!event) {
          return c.json({ success: false, error: "Webhook event not found" }, 404);
        }

        return c.json({ success: true, data: publicWebhookEvent(event) });
      },
    );
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
    let result: Awaited<ReturnType<typeof bootstrap.discountsService.createDiscount>>;
    try {
      result = await bootstrap.discountsService.createDiscount({
        code: bodyData.code,
        type: bodyData.type,
        value: bodyData.value,
        startDate: bodyData.startDate,
        endDate: bodyData.endDate,
        maxUses: bodyData.maxUses,
      });
    } catch (error) {
      await recordMutationAudit(c, {
        action: "discount.create",
        outcome: "failure",
        targetType: "discount",
        targetId: null,
        after: null,
        metadata: { error: safeErrorMessage(error, "Discount create failed") },
      });
      throw error;
    }
    const discount = resultField(result, "discount");
    const discountSummary = safeDiscountSummary(discount);

    await recordMutationAudit(c, {
      action: "discount.create",
      outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
      targetType: "discount",
      targetId: isRecord(discount) && typeof discount.id === "string" ? discount.id : null,
      after: isSuccessfulMutationResult(result) ? discountSummary : null,
      metadata: isSuccessfulMutationResult(result)
        ? { code: discountSummary?.code ?? null }
        : { error: resultError(result, "Discount create failed") },
    });

    return c.json(result, result.success ? 200 : 400);
  });

  router.patch("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      return withJsonBody(c, updateDiscountSchema, "Invalid discount update payload", async (bodyData) => {
        let result: Awaited<ReturnType<typeof bootstrap.discountsService.updateDiscount>>;
        try {
          result = await bootstrap.discountsService.updateDiscount({
            id: discountId,
            code: bodyData.code,
            type: bodyData.type,
            value: bodyData.value,
            startDate: bodyData.startDate,
            endDate: bodyData.endDate,
            maxUses: bodyData.maxUses,
            status: bodyData.status,
          });
        } catch (error) {
          await recordMutationAudit(c, {
            action: "discount.update",
            outcome: "failure",
            targetType: "discount",
            targetId: discountId,
            before: null,
            after: null,
            metadata: { error: safeErrorMessage(error, "Discount update failed") },
          });
          throw error;
        }
        const discount = resultField(result, "discount");
        const previousDiscount = resultField(result, "previousDiscount");
        const discountSummary = safeDiscountSummary(discount);
        const previousDiscountSummary = safeDiscountSummary(previousDiscount);

        await recordMutationAudit(c, {
          action: "discount.update",
          outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
          targetType: "discount",
          targetId: discountId,
          before: isSuccessfulMutationResult(result) ? previousDiscountSummary : null,
          after: isSuccessfulMutationResult(result) ? discountSummary : null,
          metadata: isSuccessfulMutationResult(result)
            ? { code: discountSummary?.code ?? null }
            : { error: resultError(result, "Discount update failed") },
        });

        return c.json(publicMutationResult(result, ["previousDiscount"]), result.success ? 200 : 400);
      });
    });
  });

  router.delete("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      let result: Awaited<ReturnType<typeof bootstrap.discountsService.deleteDiscount>>;
      try {
        result = await bootstrap.discountsService.deleteDiscount(discountId);
      } catch (error) {
        await recordMutationAudit(c, {
          action: "discount.delete",
          outcome: "failure",
          targetType: "discount",
          targetId: discountId,
          before: null,
          metadata: { error: safeErrorMessage(error, "Discount delete failed") },
        });
        throw error;
      }
      const previousDiscount = resultField(result, "previousDiscount");
      const previousDiscountSummary = safeDiscountSummary(previousDiscount);

      await recordMutationAudit(c, {
        action: "discount.delete",
        outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
        targetType: "discount",
        targetId: discountId,
        before: isSuccessfulMutationResult(result) ? previousDiscountSummary : null,
        metadata: isSuccessfulMutationResult(result)
          ? { code: previousDiscountSummary?.code ?? null }
          : { error: resultError(result, "Discount delete failed") },
      });

      return c.json(publicMutationResult(result, ["previousDiscount"]), result.success ? 200 : 400);
    });
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

    let result: Awaited<ReturnType<typeof bootstrap.vouchersService.createVoucher>>;
    try {
      result = await bootstrap.vouchersService.createVoucher(parsedBody.data);
    } catch (error) {
      await recordMutationAudit(c, {
        action: "voucher.create",
        outcome: "failure",
        targetType: "voucher",
        targetId: null,
        after: null,
        metadata: { error: safeErrorMessage(error, "Voucher create failed") },
      });
      throw error;
    }
    const voucher = resultField(result, "voucher");
    const voucherSummary = safeVoucherSummary(voucher);

    await recordMutationAudit(c, {
      action: "voucher.create",
      outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
      targetType: "voucher",
      targetId: isRecord(voucher) && typeof voucher.id === "string" ? voucher.id : null,
      after: isSuccessfulMutationResult(result) ? voucherSummary : null,
      metadata: isSuccessfulMutationResult(result)
        ? { code: voucherSummary?.code ?? null }
        : { error: resultError(result, "Voucher create failed") },
    });

    return c.json(result, result.success ? 200 : 400);
  });

  router.patch("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      return withJsonBody(c, updateVoucherSchema, "Invalid voucher update payload", async (bodyData) => {
        let result: Awaited<ReturnType<typeof bootstrap.vouchersService.updateVoucher>>;
        try {
          result = await bootstrap.vouchersService.updateVoucher({
            id: voucherId,
            ...bodyData,
          });
        } catch (error) {
          await recordMutationAudit(c, {
            action: "voucher.update",
            outcome: "failure",
            targetType: "voucher",
            targetId: voucherId,
            before: null,
            after: null,
            metadata: { error: safeErrorMessage(error, "Voucher update failed") },
          });
          throw error;
        }
        const voucher = resultField(result, "voucher");
        const previousVoucher = resultField(result, "previousVoucher");
        const voucherSummary = safeVoucherSummary(voucher);
        const previousVoucherSummary = safeVoucherSummary(previousVoucher);

        await recordMutationAudit(c, {
          action: "voucher.update",
          outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
          targetType: "voucher",
          targetId: voucherId,
          before: isSuccessfulMutationResult(result) ? previousVoucherSummary : null,
          after: isSuccessfulMutationResult(result) ? voucherSummary : null,
          metadata: isSuccessfulMutationResult(result)
            ? { code: voucherSummary?.code ?? null }
            : { error: resultError(result, "Voucher update failed") },
        });

        return c.json(publicMutationResult(result, ["previousVoucher"]), result.success ? 200 : 400);
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

    try {
      const data = logger.readLogEntries(parsedQuery.data);
      return c.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid log file") {
        return validationError(c, "Invalid log entries query");
      }
      throw error;
    }
  });

  router.get("/notifications", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const data = await bootstrap.notificationsService.getAllNotifications(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.get("/notifications/sends", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notification sends query");
    }

    const entries = await bootstrap.auditService.listAuditEntries({ actionPrefix: "notification.", limit: parsedQuery.data.limit });
    return c.json({ success: true, data: entries.map((entry: Record<string, unknown>) => notificationSendHistoryItem(entry)) });
  });

  router.get("/notifications/search-users", async (c) => {
    const parsedQuery = parseQuery(searchUsersQuerySchema, {
      query: c.req.query("query"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notification search query");
    }

    const users = await bootstrap.adminService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.post("/notifications/send-all", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationBaseSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const result = await bootstrap.notificationsService.sendNotificationToAllUsers({
      ...parsedBody.data,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      action: "notification.send_all",
      outcome: "success",
      targetType: "notification_batch",
      targetId: result.batchId ?? null,
      after: {
        scope: "all",
        title: parsedBody.data.title,
        message: parsedBody.data.message,
        type: parsedBody.data.type ?? "info",
        category: parsedBody.data.category ?? "system",
        showAsBanner: parsedBody.data.showAsBanner ?? false,
      },
      metadata: publicResult,
    });

    return c.json({ success: true, data: publicResult });
  });

  router.post("/notifications/send-users", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationToUsersSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const result = await bootstrap.notificationsService.sendNotificationToUsers({
      ...parsedBody.data,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      action: "notification.send_users",
      outcome: "success",
      targetType: "notification_batch",
      targetId: result.batchId ?? null,
      after: {
        scope: "selected",
        title: parsedBody.data.title,
        message: parsedBody.data.message,
        type: parsedBody.data.type ?? "info",
        category: parsedBody.data.category ?? "system",
        showAsBanner: parsedBody.data.showAsBanner ?? false,
      },
      metadata: {
        ...publicResult,
        requestedRecipientCount: parsedBody.data.userIds.length,
      },
    });

    return c.json({ success: true, data: publicResult });
  });

  return router;
}
