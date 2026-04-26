import { z } from "zod";

import {
  banUserSchema,
  billingListQuerySchema,
  billingRangeQuerySchema,
  clientLogSchema,
  countriesResponseSchema,
  countriesQuerySchema,
  createCheckoutRequestSchema,
  discountIdParamSchema,
  discountListQuerySchema,
  discountUserAssignmentSchema,
  generateDiscountCodeSchema,
  invoiceRequestSchema,
  logEntriesQuerySchema,
  logFilesQuerySchema,
  mobileRefreshRequestSchema,
  mobileRevokeRequestSchema,
  mobileTokenRequestSchema,
  notificationIdParamSchema,
  notificationsListQuerySchema,
  optionalLimitQuerySchema,
  paginationQuerySchema,
  redeemVoucherSchema,
  searchUsersQuerySchema,
  setRoleSchema,
  setUserPasswordSchema,
  userIdParamSchema,
  userOnlySchema,
  validateDiscountCodeSchema,
  verifyBanSecretSchema,
  voucherIdParamSchema,
  voucherListQuerySchema,
} from "@platform/contracts/wire";

import { env } from "./env";
import { schemaFromZod } from "./lib/http";

type OpenApiOperation = {
  operationId: string;
  tags: string[];
  summary: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, Record<string, unknown>>;
};

type OpenApiMethod = "get" | "post" | "patch" | "put" | "delete";
type OpenApiPathItem = Partial<Record<"get" | "post" | "patch" | "put" | "delete", OpenApiOperation>>;

export type AppOwnedApiRoute = {
  method: OpenApiMethod;
  path: string;
  operation: OpenApiOperation;
};

const cookieOrBearerAuth: Array<Record<string, string[]>> = [{ cookieAuth: [] }, { bearerAuth: [] }];
const genericSuccessSchema = z.object({ success: z.literal(true) }).passthrough();
const genericErrorSchema = z.object({ success: z.literal(false), error: z.string() }).passthrough();
const genericObjectSchema = z.object({}).passthrough();

function jsonContent(schema: z.ZodTypeAny) {
  return {
    "application/json": {
      schema: schemaFromZod(schema),
    },
  };
}

function jsonResponse(description: string, schema: z.ZodTypeAny = genericSuccessSchema) {
  return {
    description,
    content: jsonContent(schema),
  };
}

function requestBody(schema: z.ZodTypeAny = genericObjectSchema) {
  return {
    required: true,
    content: jsonContent(schema),
  };
}

function queryParameter(name: string, schema: z.ZodTypeAny, required = false) {
  return {
    name,
    in: "query",
    required,
    schema: schemaFromZod(schema),
  };
}

function pathParameter(name: string, schema: z.ZodTypeAny) {
  return {
    name,
    in: "path",
    required: true,
    schema: schemaFromZod(schema),
  };
}

function headerParameter(name: string, schema: z.ZodTypeAny, required = false) {
  return {
    name,
    in: "header",
    required,
    schema: schemaFromZod(schema),
  };
}

function defaultResponses(description: string, extraStatuses: Array<"400" | "401" | "403" | "404" | "409" | "413" | "429"> = []) {
  const responses: Record<string, Record<string, unknown>> = {
    "200": jsonResponse(description),
  };

  for (const status of extraStatuses) {
    responses[status] = jsonResponse(
      {
        "400": "Bad request",
        "401": "Unauthorized",
        "403": "Forbidden",
        "404": "Not found",
        "409": "Conflict",
        "413": "Payload too large",
        "429": "Too many requests",
      }[status],
      genericErrorSchema,
    );
  }

  return responses;
}

function operationIdFor(method: OpenApiMethod, path: string) {
  const parts = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .flatMap((part) => part.split("-"));

  return `${method}${parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}`;
}

function route(
  method: OpenApiMethod,
  path: string,
  tags: string[],
  summary: string,
  options: Partial<Omit<OpenApiOperation, "operationId" | "tags" | "summary">> = {},
): AppOwnedApiRoute {
  return {
    method,
    path,
    operation: {
      operationId: operationIdFor(method, path),
      tags,
      summary,
      responses: defaultResponses("OK", options.security ? ["401"] : []),
      ...options,
    },
  };
}

function buildOpenApiPaths(routes: AppOwnedApiRoute[]) {
  return routes.reduce<Record<string, OpenApiPathItem>>((paths, apiRoute) => {
    paths[apiRoute.path] = {
      ...(paths[apiRoute.path] ?? {}),
      [apiRoute.method]: apiRoute.operation,
    };
    return paths;
  }, {});
}

const paginationParameters = [
  queryParameter("limit", paginationQuerySchema.shape.limit),
  queryParameter("offset", paginationQuerySchema.shape.offset),
];
const optionalLimitParameters = [queryParameter("limit", optionalLimitQuerySchema.shape.limit)];
const billingRangeParameters = [queryParameter("timeRange", billingRangeQuerySchema.shape.timeRange)];
const billingListParameters = [
  ...paginationParameters,
  queryParameter("searchEmail", billingListQuerySchema.shape.searchEmail),
];
const searchUsersParameters = [
  queryParameter("query", searchUsersQuerySchema.shape.query, true),
  queryParameter("limit", searchUsersQuerySchema.shape.limit),
];

export const APP_OWNED_API_ROUTES: AppOwnedApiRoute[] = [
  route("get", "/health", ["System"], "Health check", {
    responses: {
      "200": jsonResponse("Service health status", z.object({ success: z.literal(true), data: z.object({ status: z.string() }) })),
    },
  }),
  route("get", "/countries", ["System"], "List countries for a locale", {
    parameters: [queryParameter("lang", countriesQuerySchema.shape.lang)],
    responses: {
      "200": jsonResponse("Localized countries", countriesResponseSchema),
      "400": jsonResponse("Bad request", genericErrorSchema),
    },
  }),
  route("post", "/logs/client", ["Logs"], "Ingest client-side log event", {
    requestBody: requestBody(clientLogSchema),
    responses: defaultResponses("Client log accepted", ["400", "413", "429"]),
  }),
  route("post", "/payments/checkout", ["Payments"], "Create a checkout session for credit purchase", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(createCheckoutRequestSchema),
    responses: defaultResponses("Checkout session created", ["400", "401"]),
  }),
  route("post", "/payments/webhooks/dodo", ["Payments"], "Receive Dodo webhook events", {
    parameters: [headerParameter("x-dodo-signature", z.string(), true)],
    requestBody: requestBody(genericObjectSchema),
    responses: defaultResponses("Webhook processed", ["400", "401"]),
  }),

  route("post", "/auth/mobile/token", ["Auth"], "Create native-client access and refresh tokens", {
    requestBody: requestBody(mobileTokenRequestSchema),
    responses: defaultResponses("Tokens issued", ["400", "401", "403"]),
  }),
  route("post", "/auth/mobile/refresh", ["Auth"], "Rotate mobile refresh token and issue new access token", {
    requestBody: requestBody(mobileRefreshRequestSchema),
    responses: defaultResponses("Token rotated", ["400", "401"]),
  }),
  route("post", "/auth/mobile/revoke", ["Auth"], "Revoke a mobile refresh token", {
    requestBody: requestBody(mobileRevokeRequestSchema),
    responses: defaultResponses("Token revoked", ["400"]),
  }),
  route("post", "/auth/admin/stop-impersonating", ["Auth"], "Stop admin impersonation", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(genericObjectSchema),
    responses: defaultResponses("Impersonation stopped", ["401", "403"]),
  }),
  route("get", "/session/me", ["Auth"], "Get current session user", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Current session user", ["401"]),
  }),
  route("get", "/session/admin/me", ["Auth"], "Get current admin session user", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Current admin session user", ["401", "403"]),
  }),

  route("get", "/me/session", ["Me"], "Get current authenticated user", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Current authenticated user", ["401"]),
  }),
  route("get", "/me/credits/balance", ["Me"], "Get current user credit balance", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Current credit balance", ["401"]),
  }),
  route("get", "/me/credits/history", ["Me"], "Get current user credit history", {
    security: cookieOrBearerAuth,
    parameters: optionalLimitParameters,
    responses: defaultResponses("Credit history", ["400", "401"]),
  }),
  route("get", "/me/credits/purchases", ["Me"], "Get current user credit purchases", {
    security: cookieOrBearerAuth,
    parameters: optionalLimitParameters,
    responses: defaultResponses("Credit purchases", ["400", "401"]),
  }),
  route("post", "/me/credits/invoice", ["Me"], "Download invoice for a credit purchase", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(invoiceRequestSchema),
    responses: defaultResponses("Invoice URL", ["400", "401"]),
  }),
  route("post", "/me/vouchers/redeem", ["Me"], "Redeem a voucher", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(redeemVoucherSchema),
    responses: defaultResponses("Voucher redeemed", ["400", "401"]),
  }),
  route("get", "/me/notifications", ["Me"], "List current user notifications", {
    security: cookieOrBearerAuth,
    parameters: optionalLimitParameters,
    responses: defaultResponses("Notifications", ["400", "401"]),
  }),
  route("get", "/me/notifications/unread-count", ["Me"], "Get current user unread notification count", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Unread notification count", ["401"]),
  }),
  route("post", "/me/notifications/{notificationId}/read", ["Me"], "Mark notification as read", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("notificationId", notificationIdParamSchema.shape.notificationId)],
    responses: defaultResponses("Notification marked read", ["400", "401"]),
  }),
  route("delete", "/me/notifications/{notificationId}", ["Me"], "Delete notification", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("notificationId", notificationIdParamSchema.shape.notificationId)],
    responses: defaultResponses("Notification deleted", ["400", "401"]),
  }),
  route("post", "/me/notifications/read-all", ["Me"], "Mark all notifications as read", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Notifications marked read", ["401"]),
  }),

  route("get", "/admin/session", ["Admin"], "Get current authenticated admin user", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Current authenticated admin user", ["401", "403"]),
  }),
  route("get", "/admin/status", ["Admin"], "Get admin access status", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Admin access status", ["401", "403"]),
  }),
  route("post", "/admin/verify-ban-secret", ["Admin"], "Verify admin ban secret", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(verifyBanSecretSchema),
    responses: defaultResponses("Ban secret verified", ["400", "401", "403"]),
  }),
  route("get", "/admin/dashboard/stats", ["Admin"], "Get admin dashboard statistics", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("Admin dashboard stats", ["401", "403"]),
  }),
  route("get", "/admin/users", ["Admin Users"], "List users", {
    security: cookieOrBearerAuth,
    parameters: paginationParameters,
    responses: defaultResponses("Users", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/set-role", ["Admin Users"], "Set user role", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(setRoleSchema),
    responses: defaultResponses("Role updated", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/unban", ["Admin Users"], "Unban user", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(userOnlySchema),
    responses: defaultResponses("User unbanned", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/ban", ["Admin Users"], "Ban user", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(banUserSchema),
    responses: defaultResponses("User banned", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/impersonate", ["Admin Users"], "Impersonate user", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(userOnlySchema),
    responses: defaultResponses("Impersonation started", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/revoke-sessions", ["Admin Users"], "Revoke user sessions", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(userOnlySchema),
    responses: defaultResponses("Sessions revoked", ["400", "401", "403"]),
  }),
  route("post", "/admin/users/set-password", ["Admin Users"], "Set user password", {
    security: cookieOrBearerAuth,
    requestBody: requestBody(setUserPasswordSchema),
    responses: defaultResponses("Password updated", ["400", "401", "403"]),
  }),
  route("get", "/admin/users/stats", ["Admin Users"], "Get user statistics", {
    security: cookieOrBearerAuth,
    responses: defaultResponses("User statistics", ["401", "403"]),
  }),
  route("get", "/admin/users/{userId}", ["Admin Users"], "Get user detail", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("userId", userIdParamSchema.shape.userId)],
    responses: defaultResponses("User detail", ["400", "401", "403", "404"]),
  }),
  route("get", "/admin/users/{userId}/credits/balance", ["Admin Users"], "Get user credit balance", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("userId", userIdParamSchema.shape.userId)],
    responses: defaultResponses("User credit balance", ["400", "401", "403"]),
  }),
  route("get", "/admin/users/{userId}/credits/history", ["Admin Users"], "Get user credit history", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("userId", userIdParamSchema.shape.userId), ...optionalLimitParameters],
    responses: defaultResponses("User credit history", ["400", "401", "403"]),
  }),
  route("get", "/admin/users/{userId}/credits/purchases", ["Admin Users"], "Get user credit purchases", {
    security: cookieOrBearerAuth,
    parameters: [pathParameter("userId", userIdParamSchema.shape.userId), ...optionalLimitParameters],
    responses: defaultResponses("User credit purchases", ["400", "401", "403"]),
  }),

  route("get", "/admin/billing/stats", ["Admin Billing"], "Get billing statistics", { security: cookieOrBearerAuth, responses: defaultResponses("Billing statistics", ["401", "403"]) }),
  route("get", "/admin/billing/revenue", ["Admin Billing"], "Get revenue data", { security: cookieOrBearerAuth, parameters: billingRangeParameters, responses: defaultResponses("Revenue data", ["400", "401", "403"]) }),
  route("get", "/admin/billing/transactions", ["Admin Billing"], "List billing transactions", { security: cookieOrBearerAuth, parameters: billingListParameters, responses: defaultResponses("Billing transactions", ["400", "401", "403"]) }),
  route("get", "/admin/billing/purchases", ["Admin Billing"], "List billing purchases", { security: cookieOrBearerAuth, parameters: billingListParameters, responses: defaultResponses("Billing purchases", ["400", "401", "403"]) }),
  route("get", "/admin/billing/transactions-chart", ["Admin Billing"], "Get billing transactions chart", { security: cookieOrBearerAuth, parameters: billingRangeParameters, responses: defaultResponses("Billing transactions chart", ["400", "401", "403"]) }),
  route("get", "/admin/billing/credits-consumed-chart", ["Admin Billing"], "Get credits consumed chart", { security: cookieOrBearerAuth, parameters: billingRangeParameters, responses: defaultResponses("Credits consumed chart", ["400", "401", "403"]) }),

  route("get", "/admin/discounts", ["Admin Discounts"], "List discounts", { security: cookieOrBearerAuth, parameters: [...paginationParameters, queryParameter("search", discountListQuerySchema.shape.search), queryParameter("status", discountListQuerySchema.shape.status)], responses: defaultResponses("Discounts", ["400", "401", "403"]) }),
  route("get", "/admin/discounts/search-users", ["Admin Discounts"], "Search users for discount assignment", { security: cookieOrBearerAuth, parameters: searchUsersParameters, responses: defaultResponses("Users", ["400", "401", "403"]) }),
  route("get", "/admin/discounts/{discountId}", ["Admin Discounts"], "Get discount detail", { security: cookieOrBearerAuth, parameters: [pathParameter("discountId", discountIdParamSchema.shape.discountId)], responses: defaultResponses("Discount detail", ["400", "401", "403", "404"]) }),
  route("post", "/admin/discounts/generate-code", ["Admin Discounts"], "Generate discount code", { security: cookieOrBearerAuth, requestBody: requestBody(generateDiscountCodeSchema), responses: defaultResponses("Discount code", ["400", "401", "403"]) }),
  route("post", "/admin/discounts/validate-code", ["Admin Discounts"], "Validate discount code", { security: cookieOrBearerAuth, requestBody: requestBody(validateDiscountCodeSchema), responses: defaultResponses("Discount code validation", ["400", "401", "403"]) }),
  route("post", "/admin/discounts", ["Admin Discounts"], "Create discount", { security: cookieOrBearerAuth, requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Discount created", ["400", "401", "403"]) }),
  route("patch", "/admin/discounts/{discountId}", ["Admin Discounts"], "Update discount", { security: cookieOrBearerAuth, parameters: [pathParameter("discountId", discountIdParamSchema.shape.discountId)], requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Discount updated", ["400", "401", "403", "404"]) }),
  route("delete", "/admin/discounts/{discountId}", ["Admin Discounts"], "Delete discount", { security: cookieOrBearerAuth, parameters: [pathParameter("discountId", discountIdParamSchema.shape.discountId)], responses: defaultResponses("Discount deleted", ["400", "401", "403", "404"]) }),
  route("post", "/admin/discounts/{discountId}/assign", ["Admin Discounts"], "Assign discount to users", { security: cookieOrBearerAuth, parameters: [pathParameter("discountId", discountIdParamSchema.shape.discountId)], requestBody: requestBody(discountUserAssignmentSchema), responses: defaultResponses("Discount assigned", ["400", "401", "403", "404"]) }),
  route("post", "/admin/discounts/{discountId}/remove", ["Admin Discounts"], "Remove discount from users", { security: cookieOrBearerAuth, parameters: [pathParameter("discountId", discountIdParamSchema.shape.discountId)], requestBody: requestBody(discountUserAssignmentSchema), responses: defaultResponses("Discount removed", ["400", "401", "403", "404"]) }),

  route("get", "/admin/vouchers", ["Admin Vouchers"], "List vouchers", { security: cookieOrBearerAuth, parameters: [...paginationParameters, queryParameter("search", voucherListQuerySchema.shape.search), queryParameter("status", voucherListQuerySchema.shape.status)], responses: defaultResponses("Vouchers", ["400", "401", "403"]) }),
  route("get", "/admin/vouchers/search-users", ["Admin Vouchers"], "Search users for voucher assignment", { security: cookieOrBearerAuth, parameters: searchUsersParameters, responses: defaultResponses("Users", ["400", "401", "403"]) }),
  route("get", "/admin/vouchers/{voucherId}", ["Admin Vouchers"], "Get voucher detail", { security: cookieOrBearerAuth, parameters: [pathParameter("voucherId", voucherIdParamSchema.shape.voucherId)], responses: defaultResponses("Voucher detail", ["400", "401", "403", "404"]) }),
  route("post", "/admin/vouchers", ["Admin Vouchers"], "Create voucher", { security: cookieOrBearerAuth, requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Voucher created", ["400", "401", "403"]) }),
  route("patch", "/admin/vouchers/{voucherId}", ["Admin Vouchers"], "Update voucher", { security: cookieOrBearerAuth, parameters: [pathParameter("voucherId", voucherIdParamSchema.shape.voucherId)], requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Voucher updated", ["400", "401", "403", "404"]) }),

  route("get", "/admin/logs/files", ["Admin Logs"], "List log files", { security: cookieOrBearerAuth, parameters: [queryParameter("stream", logFilesQuerySchema.shape.stream)], responses: defaultResponses("Log files", ["400", "401", "403"]) }),
  route("get", "/admin/logs/entries", ["Admin Logs"], "Read log entries", { security: cookieOrBearerAuth, parameters: [queryParameter("stream", logEntriesQuerySchema.shape.stream), queryParameter("file", logEntriesQuerySchema.shape.file), queryParameter("limit", logEntriesQuerySchema.shape.limit)], responses: defaultResponses("Log entries", ["400", "401", "403"]) }),
  route("get", "/admin/notifications", ["Admin Notifications"], "List notifications", { security: cookieOrBearerAuth, parameters: [queryParameter("limit", notificationsListQuerySchema.shape.limit)], responses: defaultResponses("Notifications", ["400", "401", "403"]) }),
  route("post", "/admin/notifications/send-all", ["Admin Notifications"], "Send notification to all users", { security: cookieOrBearerAuth, requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Notification sent", ["400", "401", "403"]) }),
  route("post", "/admin/notifications/send-users", ["Admin Notifications"], "Send notification to selected users", { security: cookieOrBearerAuth, requestBody: requestBody(genericObjectSchema), responses: defaultResponses("Notification sent", ["400", "401", "403"]) }),
];

const customPaths = buildOpenApiPaths(APP_OWNED_API_ROUTES);

export function mergeOpenApiSpecs(authSpec: Record<string, any>) {
  return {
    ...authSpec,
    info: {
      title: "SaaS Platform API",
      version: "1.0.0",
      description:
        "Standalone API for authentication, billing, notifications, discounts, and admin operations shared by the web, admin, and future native clients.",
    },
    servers: [{ url: env.API_URL }],
    components: {
      ...(authSpec.components ?? {}),
      securitySchemes: {
        ...(authSpec.components?.securitySchemes ?? {}),
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      ...(authSpec.paths ?? {}),
      ...customPaths,
    },
  };
}

export function createFallbackOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SaaS Platform API",
      version: "1.0.0",
      description:
        "Standalone API for authentication, billing, notifications, discounts, and admin operations shared by the web, admin, and future native clients.",
    },
    servers: [{ url: env.API_URL }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      "/auth/sign-in/email": {
        post: {
          summary: "Sign in with email and password (browser session flow)",
          responses: {
            "200": { description: "Signed in" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      ...customPaths,
    },
  };
}
