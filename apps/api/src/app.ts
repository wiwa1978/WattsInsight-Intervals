import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, haveIBeenPwned, magicLink, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { passkey } from "@better-auth/passkey";
import { checkout, dodopayments, portal } from "@dodopayments/better-auth";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import DodoPayments from "dodopayments";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { z } from "zod";

import { authAdditionalUserFields, createAuthModule } from "@platform/auth-core";
import { createEmailModule, createResendProvider } from "@platform/email-core";
import { createPaymentsModule } from "@platform/payments-core";
import { country, createPlatformDb, mobileRefreshToken, user } from "@platform/platform-db";

import { authConfig } from "./config/auth";
import { creditPackages } from "./config/billing";
import { env } from "./env";
import { createAdminService } from "./modules/admin/service";
import { createBillingService } from "./modules/billing/service";
import { createDiscountsService } from "./modules/discounts/service";
import { createNotificationsService } from "./modules/notifications/service";
import { logger } from "./observability/logger";
import { Sentry, setupSentry } from "./observability/sentry";

type JsonContext = {
  json: (body: unknown, status?: number) => Response;
};

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const optionalLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const timeRangeSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
const userIdParamSchema = z.object({ userId: z.string().uuid() });
const discountIdParamSchema = z.object({ discountId: z.string().uuid() });
const notificationIdParamSchema = z.object({ notificationId: z.string().uuid() });
const searchUsersQuerySchema = z.object({
  query: z.string().trim().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const countriesQuerySchema = z.object({
  lang: z.enum(["en", "fr", "nl"]).default("en"),
});
const billingRangeQuerySchema = z.object({
  timeRange: timeRangeSchema.default("daily"),
});
const billingListQuerySchema = paginationQuerySchema.extend({
  searchEmail: z.string().trim().email().max(255).optional(),
});
const packageCheckoutSchema = z.object({
  packageKey: z.string().trim().min(1).max(64),
});
const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
const verifyBanSecretSchema = z.object({
  secret: z.string().trim().min(1).max(255),
});
const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});
const userOnlySchema = z.object({
  userId: z.string().uuid(),
});
const setUserPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(1).max(255),
});
const discountStatusSchema = z.enum(["active", "inactive", "expired"]);
const discountTypeSchema = z.literal("percentage");
const discountListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(255).optional(),
  status: discountStatusSchema.optional(),
});
const generateDiscountCodeSchema = z.object({
  overridePrefix: z.string().trim().min(2).max(20).regex(/^[A-Z0-9]+$/).optional(),
});
const validateDiscountCodeSchema = z.object({
  code: z.string().trim().min(1).max(50),
  excludeId: z.string().uuid().optional(),
});
const createDiscountSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/),
  type: discountTypeSchema,
  value: z.number().min(0.01).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
  userIds: z.array(z.string().uuid()).max(500).optional(),
});
const updateDiscountSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/).optional(),
  type: discountTypeSchema.optional(),
  value: z.number().min(0.01).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
  status: discountStatusSchema.optional(),
});
const discountUserAssignmentSchema = z.object({
  userIds: z.array(z.string().uuid()).max(500),
});
const notificationTypeSchema = z.enum(["info", "warning", "success", "error"]);
const notificationCategorySchema = z.string().trim().min(1).max(100);
const sendNotificationBaseSchema = z.object({
  title: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1000),
  type: notificationTypeSchema.optional(),
  category: notificationCategorySchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  showAsBanner: z.boolean().optional(),
  bannerExpiresAt: z.coerce.date().optional(),
});
const sendNotificationToUsersSchema = sendNotificationBaseSchema.extend({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

function validationError(c: JsonContext, message: string) {
  return c.json({ success: false, error: message }, 400);
}

function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  return schema.safeParse(body);
}

function parseQuery<T>(schema: z.ZodSchema<T>, query: Record<string, string | undefined>) {
  return schema.safeParse(query);
}

function parseParams<T>(schema: z.ZodSchema<T>, params: Record<string, string>) {
  return schema.safeParse(params);
}

async function proxyAuthAdminRequest(
  request: Request,
  path: string,
  body?: Record<string, unknown>,
) {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");

  if (cookie) {
    headers.set("cookie", cookie);
  }

  headers.set("content-type", "application/json");

  const response = await fetch(`${env.API_URL}/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
    headers: response.headers,
  };
}

function jsonProxyResponse(payload: unknown, status: number, headers?: Headers) {
  const responseHeaders = new Headers({
    "content-type": "application/json",
  });

  const setCookie = headers?.get("set-cookie");
  if (setCookie) {
    responseHeaders.set("set-cookie", setCookie);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}

function buildErrorCode(requestId: string) {
  return `API-${requestId}`;
}

const adminAllowlist = new Set(
  (env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

const { db } = createPlatformDb({
  connectionString: env.DATABASE_URL,
});

const emailProvider = env.RESEND_API_KEY
  ? createResendProvider({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL ?? "noreply@example.com",
    })
  : {
      async send() {
        return { success: false, error: new Error("No email provider configured") } as const;
      },
    };

const emailModule = createEmailModule({
  provider: emailProvider,
  defaultFrom: env.RESEND_FROM_EMAIL ?? "noreply@example.com",
});

const notificationsService = createNotificationsService({ db });
const billingService = createBillingService({
  db,
  env,
  notifications: notificationsService,
});
const adminService = createAdminService({
  db,
  adminBanSecret: env.ADMIN_BAN_SECRET,
});
const discountsService = createDiscountsService({
  db,
  env,
});

const dodoPaymentsClient = env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT,
    })
  : null;

const authModule = createAuthModule({
  betterAuthOptions: {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: `${env.API_URL}/auth`,
    trustedOrigins: [
      env.APP_URL,
      env.API_URL,
      ...(env.ADMIN_APP_URL ? [env.ADMIN_APP_URL] : []),
      ...(env.BETTER_AUTH_ALLOWED_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean) ?? []),
    ],
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    user: {
      changeEmail: {
        enabled: authConfig.allowChangeEmail,
      },
      deleteUser: {
        enabled: authConfig.allowDeleteUser,
      },
        additionalFields: authAdditionalUserFields,
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: !authConfig.requireEmailVerification,
      minPasswordLength: authConfig.passwordValidation.minLength,
      maxPasswordLength: authConfig.passwordValidation.maxLength,
      requireEmailVerification: authConfig.requireEmailVerification,
      resetPasswordTokenExpiresIn: authConfig.passwordResetTokenExpiresInHours * 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await emailModule.sendTemplate({
          to: user.email,
          subject: "Reset your password",
          html: `<p>Hello ${user.name ?? "there"}, reset your password: <a href=\"${url}\">${url}</a></p>`,
          text: `Reset your password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: authConfig.sendVerificationEmailOnSignup,
      autoSignInAfterVerification: authConfig.autoSignInAfterVerification,
      expiresIn: authConfig.verificationTokenExpiresInHours * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await emailModule.sendTemplate({
          to: user.email,
          subject: "Verify your email",
          html: `<p>Hello ${user.name ?? "there"}, verify your email: <a href=\"${url}\">${url}</a></p>`,
          text: `Verify your email: ${url}`,
        });
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: authConfig.allowAccountLinking,
        allowDifferentEmails: authConfig.allowDifferentEmailsOnLink,
      },
    },
    session: {
      expiresIn: authConfig.sessionExpiresIn,
      updateAge: authConfig.sessionUpdateAge,
      freshAge: authConfig.sessionFreshAge,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    plugins: [
      ...(authConfig.enableTwoFactor
        ? [
            twoFactor({
              issuer: authConfig.twoFactorIssuer,
              backupCodes: {
                length: 10,
                characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
              },
            }),
          ]
        : []),
      ...(authConfig.enablePasskeys
        ? [
            passkey({
              rpName: authConfig.twoFactorIssuer,
              rpID: new URL(env.APP_URL).hostname,
              origin: env.APP_URL,
            }),
          ]
        : []),
      ...(authConfig.enableMagicLink
        ? [
            magicLink({
              expiresIn: authConfig.magicLinkTokenExpiresInMinutes * 60,
              sendMagicLink: async ({ email, url }) => {
                await emailModule.sendTemplate({
                  to: email,
                  subject: "Your magic link",
                  html: `<p>Use this magic link: <a href=\"${url}\">${url}</a></p>`,
                  text: `Use this magic link: ${url}`,
                });
              },
            }),
          ]
        : []),
      ...(authConfig.enableHaveIBeenPwned ? [haveIBeenPwned()] : []),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        roles: {
          user: userAc,
          admin: adminAc,
        },
      }),
      ...(dodoPaymentsClient
        ? [
            dodopayments({
              client: dodoPaymentsClient,
              createCustomerOnSignUp: true,
              getCustomerParams: (authUser) => ({
                metadata: {
                  userId: authUser.id,
                },
              }),
              use: [
                checkout({
                  products: creditPackages.map((pkg) => ({
                    productId: pkg.productId,
                    slug: pkg.key,
                  })),
                  successUrl: `${env.APP_URL}/billing?success=true`,
                  authenticatedUsersOnly: true,
                }),
                portal(),
              ],
            }),
          ]
        : []),
    ],
  },
  users: {
    async findById(userId) {
      const [record] = await db
        .select({
          id: user.id,
          role: user.role,
          email: user.email,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      return record ?? null;
    },
  },
  admin: {
    allowlist: adminAllowlist,
  },
  jwt: {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  },
  refreshTokens: {
    async create({ tokenHash, userId, expiresAt }) {
      await db.insert(mobileRefreshToken).values({
        tokenHash,
        userId,
        expiresAt,
      });
    },
    async findActiveByHash(tokenHash) {
      const [record] = await db
        .select({ userId: mobileRefreshToken.userId })
        .from(mobileRefreshToken)
        .where(and(eq(mobileRefreshToken.tokenHash, tokenHash), isNull(mobileRefreshToken.revokedAt)));

      return record ?? null;
    },
    async rotate({ currentTokenHash, nextTokenHash, userId, nextExpiresAt }) {
      const now = new Date();

      const updatedRows = await db
        .update(mobileRefreshToken)
        .set({ revokedAt: now, replacedByTokenHash: nextTokenHash })
        .where(and(eq(mobileRefreshToken.tokenHash, currentTokenHash), isNull(mobileRefreshToken.revokedAt)))
        .returning({ id: mobileRefreshToken.id });

      if (updatedRows.length === 0) {
        return false;
      }

      await db.insert(mobileRefreshToken).values({
        tokenHash: nextTokenHash,
        userId,
        expiresAt: nextExpiresAt,
      });

      return true;
    },
    async revokeByHash(tokenHash) {
      await db
        .update(mobileRefreshToken)
        .set({ revokedAt: new Date() })
        .where(and(eq(mobileRefreshToken.tokenHash, tokenHash), isNull(mobileRefreshToken.revokedAt)));
    },
    async cleanupExpired() {
      await db
        .delete(mobileRefreshToken)
        .where(lte(mobileRefreshToken.expiresAt, new Date()));
    },
  },
});

const paymentsModule = createPaymentsModule({
  dodoWebhookSecret: env.DODO_PAYMENTS_WEBHOOK_SECRET,
  onPaymentEvent: async (event) => {
    if (event.eventType !== "payment.succeeded") {
      return;
    }

    if (!event.productId) {
      throw new Error("Missing product id");
    }

    const metadataUserId = typeof event.metadata?.userId === "string" ? event.metadata.userId : undefined;
    const foundUser = metadataUserId
      ? await billingService.getUserById(metadataUserId)
      : event.customerEmail
        ? await billingService.getUserByEmail(event.customerEmail)
        : null;

    if (!foundUser) {
      throw new Error(`User not found for payment ${event.paymentId}`);
    }

    const matchedPackage = creditPackages.find((item) => item.productId === event.productId);
    if (!matchedPackage) {
      throw new Error(`Unknown product id: ${event.productId}`);
    }

    await billingService.processCreditPurchase(
      foundUser.id,
      matchedPackage.key,
      event.paymentId,
      "completed",
      event.customerId,
      {
        priceExclVat: (event.totalAmount ?? 0) - (event.taxAmount ?? 0),
        priceInclVat: event.totalAmount ?? 0,
        vatAmount: event.taxAmount ?? 0,
        currency: event.currency ?? "EUR",
      },
    );
  },
});

const app = new Hono();

const clientLogSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("error"),
  message: z.string().min(1),
  context: z.unknown().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string().optional(),
});

setupSentry();

app.use("/*", requestId());

app.use("/*", async (c, next) => {
  const start = Date.now();

  await next();

  const requestId = c.get("requestId") as string | undefined;
  if (requestId) {
    c.header("x-request-id", requestId);
  }

  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  }, "request.completed");
});

app.onError((error, c) => {
  const requestId = (c.get("requestId") as string | undefined) ?? crypto.randomUUID();
  const errorCode = buildErrorCode(requestId);

  Sentry.captureException(error, {
    tags: {
      requestId,
      errorCode,
    },
  });

  logger.error({
    requestId,
    errorCode,
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
  }, "request.failed");

  const response = c.json(
    env.NODE_ENV === "development"
      ? {
          success: false,
          error: error instanceof Error ? error.message : "Internal server error",
          errorCode,
          requestId,
        }
      : {
          success: false,
          error: "Internal server error",
          errorCode,
          requestId,
        },
    500,
  );

  response.headers.set("x-request-id", requestId);
  response.headers.set("x-error-code", errorCode);

  return response;
});

const openApiSpec = {
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
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: false },
          error: { type: "string" },
        },
        required: ["success", "error"],
      },
      AuthUser: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["user", "admin"] },
          email: { type: "string", format: "email", nullable: true },
        },
        required: ["id", "role", "email"],
      },
      SessionResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: true },
          data: { $ref: "#/components/schemas/AuthUser" },
        },
        required: ["success", "data"],
      },
      MobileTokenRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
        required: ["email", "password"],
      },
      MobileTokenResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              expiresInSeconds: { type: "integer" },
              tokenType: { type: "string", enum: ["Bearer"] },
            },
            required: ["accessToken", "refreshToken", "expiresInSeconds", "tokenType"],
          },
        },
        required: ["success", "data"],
      },
      MobileRefreshRequest: {
        type: "object",
        properties: {
          refreshToken: { type: "string" },
        },
        required: ["refreshToken"],
      },
      MobileRevokeResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            properties: {
              revoked: { type: "boolean" },
            },
            required: ["revoked"],
          },
        },
        required: ["success", "data"],
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "Service health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
        },
      },
    },
    "/countries": {
      get: {
        summary: "List countries for a locale",
        parameters: [
          {
            name: "lang",
            in: "query",
            schema: {
              type: "string",
              enum: ["en", "fr", "nl"],
              default: "en",
            },
          },
        ],
        responses: {
          "200": {
            description: "Localized countries",
          },
        },
      },
    },
    "/auth/sign-in/email": {
      post: {
        summary: "Sign in with email and password (browser session flow)",
        responses: {
          "200": { description: "Signed in" },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/me/session": {
      get: {
        summary: "Get the current authenticated user for browser/web clients",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current authenticated user",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SessionResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/admin/session": {
      get: {
        summary: "Get the current authenticated admin user after admin authorization",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current authenticated admin user",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SessionResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/auth/mobile/token": {
      post: {
        summary: "Create native-client access and refresh tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MobileTokenRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Tokens issued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MobileTokenResponse" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/auth/mobile/refresh": {
      post: {
        summary: "Rotate mobile refresh token and issue new access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MobileRefreshRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Token rotated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MobileTokenResponse" },
              },
            },
          },
          "401": {
            description: "Invalid refresh token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/auth/mobile/revoke": {
      post: {
        summary: "Revoke a mobile refresh token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MobileRefreshRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Token revoked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MobileRevokeResponse" },
              },
            },
          },
        },
      },
    },
    "/me/credits/balance": {
      get: {
        summary: "Get current user credit balance",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": { description: "Current credit balance" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/admin/dashboard/stats": {
      get: {
        summary: "Get admin dashboard statistics",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": { description: "Admin dashboard stats" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/webhooks/dodo-payments": {
      post: {
        summary: "Receive Dodo webhook events",
        responses: {
          "200": { description: "Webhook processed" },
          "401": { description: "Invalid signature" },
        },
      },
    },
  },
} as const;

const allowedCorsOrigins = new Set(
  [
    env.APP_URL,
    env.API_URL,
    ...(env.ADMIN_APP_URL ? [env.ADMIN_APP_URL] : []),
    ...(env.BETTER_AUTH_ALLOWED_ORIGINS
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []),
  ],
);

const appUrlHostname = new URL(env.APP_URL).hostname;

function isAllowedCorsOrigin(origin: string) {
  if (allowedCorsOrigins.has(origin)) {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    try {
      const parsedOrigin = new URL(origin);
      return (
        parsedOrigin.hostname === appUrlHostname
        || parsedOrigin.hostname === "localhost"
        || parsedOrigin.hostname === "127.0.0.1"
      );
    } catch {
      return false;
    }
  }

  return false;
}

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return env.APP_URL;
      }

      return isAllowedCorsOrigin(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "baggage",
      "sentry-trace",
      "x-better-auth-client",
      "x-captcha-response",
    ],
    exposeHeaders: ["Content-Length", "Set-Cookie"],
    credentials: true,
  }),
);

app.get("/health", (c) => {
  return c.json({ success: true, data: { status: "ok" } });
});

app.get("/countries", async (c) => {
  const parsedQuery = parseQuery(countriesQuerySchema, {
    lang: c.req.query("lang"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid countries query");
  }

  const localizedCountries = await db
    .select({
      id: country.id,
      name: country.name,
      code: country.code,
      language: country.language,
    })
    .from(country)
    .where(eq(country.language, parsedQuery.data.lang))
    .orderBy(asc(country.name));

  if (localizedCountries.length > 0) {
    return c.json(localizedCountries);
  }

  const fallbackCountries = await db
    .select({
      id: country.id,
      name: country.name,
      code: country.code,
      language: country.language,
    })
    .from(country)
    .where(eq(country.language, "en"))
    .orderBy(asc(country.name));

  return c.json(fallbackCountries);
});

app.post("/logs/client", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = clientLogSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: "Invalid log payload" }, 400);
  }

  const payload = parsed.data;
  const requestId = c.get("requestId");
  const logRecord = {
    requestId,
    source: "web",
    url: payload.url,
    userAgent: payload.userAgent,
    timestamp: payload.timestamp,
    context: payload.context,
  };

  if (payload.level === "error") {
    logger.error(logRecord, payload.message);
    Sentry.captureMessage(payload.message, {
      level: "error",
      tags: {
        source: "web",
      },
      extra: logRecord,
    });
  } else if (payload.level === "warn") {
    logger.warn(logRecord, payload.message);
    Sentry.captureMessage(payload.message, {
      level: "warning",
      tags: {
        source: "web",
      },
      extra: logRecord,
    });
  } else if (payload.level === "info") {
    logger.info(logRecord, payload.message);
  } else {
    logger.debug(logRecord, payload.message);
  }

  return c.json({ success: true });
});

app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

app.get("/api/openapi.json", (c) => {
  return c.json(openApiSpec);
});

app.get("/api/docs", (c) => {
  const routeRows = Object.entries(openApiSpec.paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        summary: (operation as { summary?: string }).summary ?? "",
      })),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const rowsHtml = routeRows
    .map(
      (route) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${route.method}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${route.path}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${route.summary}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Routes</title>
  </head>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;max-width:1100px;margin:0 auto;">
    <h1 style="margin:0 0 8px 0;">API Routes</h1>
    <p style="margin:0 0 20px 0;color:#4b5563;">Static overview of registered OpenAPI routes.</p>
    <p style="margin:0 0 20px 0;"><a href="/api/swagger">Open Swagger UI</a></p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;">Method</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;">Path</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;">Summary</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;

  return c.html(html);
});

app.get("/api/swagger", (c) => {
  const specUrl = `${env.API_URL}/api/openapi.json`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;

  return c.html(html);
});

app.get("/docs", (c) => {
  const specUrl = `${env.API_URL}/openapi.json`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Docs</title>
  </head>
  <body>
    <script id="api-reference" data-url="${specUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

  return c.html(html);
});

app.use("/auth/admin/*", authModule.requireAuth);
app.use("/auth/admin/*", authModule.requireAdminAccess);
app.use("/auth/admin/*", async (c, next) => {
  await next();

  if (c.res.status === 403) {
    c.res.headers.set("Set-Cookie", "better-auth.session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
  }
});

app.route("/auth", authModule.router);
app.route("/session", authModule.sessionRouter);
app.route("/auth/mobile", authModule.mobileRouter);
app.route("/payments", paymentsModule.router);

app.post("/payments/checkout", authModule.requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(packageCheckoutSchema, body);

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

const meRouter = new Hono();
meRouter.use("/*", authModule.requireAuth);

meRouter.get("/session", (c) => {
  const authUser = (c as any).get("authUser") as { id: string; role?: string | null; email?: string | null };
  return c.json({
    success: true,
    data: authUser,
  });
});

meRouter.get("/credits/balance", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const balance = await billingService.getCreditBalance(authUser.id);
  return c.json({ success: true, data: balance });
});

meRouter.get("/credits/history", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid history query");
  }

  const history = await billingService.getCreditHistory(authUser.id, parsedQuery.data.limit);
  return c.json({ success: true, data: history });
});

meRouter.get("/credits/purchases", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid purchases query");
  }

  const purchases = await billingService.getCreditPurchases(authUser.id, parsedQuery.data.limit);
  return c.json({ success: true, data: purchases });
});

meRouter.post("/credits/invoice", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(invoiceRequestSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid invoice payload");
  }

  try {
    const invoice = await billingService.downloadInvoice(authUser.id, parsedBody.data.paymentId);
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

meRouter.get("/notifications", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const list = await notificationsService.listForUser(authUser.id, 20);
  return c.json({ success: true, data: list });
});

meRouter.get("/notifications/unread-count", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const count = await notificationsService.unreadCount(authUser.id);
  return c.json({ success: true, data: { count } });
});

meRouter.post("/notifications/:notificationId/read", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid notification id");
  }

  await notificationsService.markAsRead(authUser.id, parsedParams.data.notificationId);
  return c.json({ success: true, data: { marked: true } });
});

meRouter.delete("/notifications/:notificationId", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid notification id");
  }

  await notificationsService.deleteNotification(authUser.id, parsedParams.data.notificationId);
  return c.json({ success: true, data: { deleted: true } });
});

meRouter.post("/notifications/read-all", async (c) => {
  const authUser = (c as any).get("authUser") as { id: string };
  await notificationsService.markAllAsRead(authUser.id);
  return c.json({ success: true, data: { marked: true } });
});

app.route("/me", meRouter);

const adminRouter = new Hono();
adminRouter.use("/*", authModule.requireAuth);
adminRouter.use("/*", authModule.requireAdminAccess);

adminRouter.get("/session", (c) => {
  const authUser = (c as any).get("authUser") as { id: string; role?: string | null; email?: string | null };
  return c.json({
    success: true,
    data: authUser,
  });
});

adminRouter.get("/status", async (c) => {
  return c.json({
    success: true,
    data: {
      message: "Admin access granted.",
    },
  });
});

adminRouter.post("/verify-ban-secret", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(verifyBanSecretSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid secret payload");
  }

  const result = await adminService.verifyAdminBanSecret(parsedBody.data.secret);
  return c.json(result, result.success ? 200 : 400);
});

adminRouter.get("/dashboard/stats", async (c) => {
  const stats = await adminService.getDashboardStats();
  return c.json({ success: true, data: stats });
});

adminRouter.get("/users", async (c) => {
  const parsedQuery = parseQuery(paginationQuerySchema, {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid users query");
  }

  const users = await adminService.getUsers(parsedQuery.data.limit, parsedQuery.data.offset);
  return c.json({ success: true, data: users });
});

adminRouter.post("/users/set-role", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(setRoleSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid role payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/set-role", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Role update failed" }, result.status);
});

adminRouter.post("/users/unban", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(userOnlySchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid unban payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/unban-user", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Unban failed" }, result.status);
});

adminRouter.post("/users/ban", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(
    z.object({
      userId: z.string().uuid(),
      banReason: z.string().trim().min(1).max(1000).optional(),
      banExpiresIn: z.number().int().positive().optional(),
    }),
    body,
  );

  if (!parsedBody.success) {
    return validationError(c, "Invalid ban payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/ban-user", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Ban failed" }, result.status);
});

adminRouter.post("/users/impersonate", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(userOnlySchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid impersonation payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/impersonate-user", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Impersonation failed" }, result.status, result.headers);
});

adminRouter.post("/users/revoke-sessions", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(userOnlySchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid session revoke payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/revoke-user-sessions", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Session revoke failed" }, result.status);
});

adminRouter.post("/users/set-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(setUserPasswordSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid password payload");
  }

  const result = await proxyAuthAdminRequest(c.req.raw, "/admin/set-user-password", parsedBody.data);
  return jsonProxyResponse(result.payload ?? { success: false, error: "Password update failed" }, result.status);
});

adminRouter.get("/users/stats", async (c) => {
  const stats = await adminService.getUserStats();
  return c.json({ success: true, data: stats });
});

adminRouter.get("/users/:userId", async (c) => {
  const parsedParams = parseParams(userIdParamSchema, { userId: c.req.param("userId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid user id");
  }

  const userRecord = await adminService.getUserById(parsedParams.data.userId);
  if (!userRecord) {
    return c.json({ success: false, error: "User not found" }, 404);
  }

  return c.json({ success: true, data: userRecord });
});

adminRouter.get("/users/:userId/credits/balance", async (c) => {
  const parsedParams = parseParams(userIdParamSchema, { userId: c.req.param("userId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid user id");
  }

  const balance = await adminService.getUserCreditBalance(parsedParams.data.userId);
  return c.json({ success: true, data: balance });
});

adminRouter.get("/users/:userId/credits/history", async (c) => {
  const parsedParams = parseParams(userIdParamSchema, { userId: c.req.param("userId") });
  const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid user id");
  }

  if (!parsedQuery.success) {
    return validationError(c, "Invalid history query");
  }

  const history = await adminService.getUserCreditHistory(parsedParams.data.userId, parsedQuery.data.limit);
  return c.json({ success: true, data: history });
});

adminRouter.get("/users/:userId/credits/purchases", async (c) => {
  const parsedParams = parseParams(userIdParamSchema, { userId: c.req.param("userId") });
  const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid user id");
  }

  if (!parsedQuery.success) {
    return validationError(c, "Invalid purchases query");
  }

  const purchases = await adminService.getUserCreditPurchases(parsedParams.data.userId, parsedQuery.data.limit);
  return c.json({ success: true, data: purchases });
});

adminRouter.get("/billing/stats", async (c) => {
  const stats = await adminService.getBillingStats();
  return c.json({ success: true, data: stats });
});

adminRouter.get("/billing/revenue", async (c) => {
  const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid time range");
  }

  const data = await adminService.getRevenueData(parsedQuery.data.timeRange);
  return c.json({ success: true, data });
});

adminRouter.get("/billing/transactions", async (c) => {
  const parsedQuery = parseQuery(billingListQuerySchema, {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    searchEmail: c.req.query("searchEmail"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid transactions query");
  }

  const data = await adminService.getAllTransactions(
    parsedQuery.data.limit,
    parsedQuery.data.offset,
    parsedQuery.data.searchEmail,
  );
  return c.json({ success: true, data });
});

adminRouter.get("/billing/purchases", async (c) => {
  const parsedQuery = parseQuery(billingListQuerySchema, {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    searchEmail: c.req.query("searchEmail"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid purchases query");
  }

  const data = await adminService.getAllPurchases(
    parsedQuery.data.limit,
    parsedQuery.data.offset,
    parsedQuery.data.searchEmail,
  );
  return c.json({ success: true, data });
});

adminRouter.get("/billing/transactions-chart", async (c) => {
  const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid time range");
  }

  const data = await adminService.getTransactionData(parsedQuery.data.timeRange);
  return c.json({ success: true, data });
});

adminRouter.get("/billing/credits-consumed-chart", async (c) => {
  const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid time range");
  }

  const data = await adminService.getCreditsConsumedData(parsedQuery.data.timeRange);
  return c.json({ success: true, data });
});

adminRouter.get("/discounts", async (c) => {
  const parsedQuery = parseQuery(discountListQuerySchema, {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    search: c.req.query("search"),
    status: c.req.query("status"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid discount query");
  }

  const result = await discountsService.getDiscounts(
    parsedQuery.data.limit,
    parsedQuery.data.offset,
    parsedQuery.data.search,
    parsedQuery.data.status,
  );
  return c.json({ success: true, data: result });
});

adminRouter.get("/discounts/:discountId", async (c) => {
  const parsedParams = parseParams(discountIdParamSchema, { discountId: c.req.param("discountId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid discount id");
  }

  const result = await discountsService.getDiscountById(parsedParams.data.discountId);
  return c.json(result, result.success ? 200 : 404);
});

adminRouter.post("/discounts/generate-code", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsedBody = parseJsonBody(generateDiscountCodeSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount code payload");
  }

  try {
    const code = await discountsService.generateDiscountCode(parsedBody.data.overridePrefix);
    return c.json({ success: true, data: { code } });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : "Failed" }, 400);
  }
});

adminRouter.post("/discounts/validate-code", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(validateDiscountCodeSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount validation payload");
  }

  const result = await discountsService.validateDiscountCode(parsedBody.data.code, parsedBody.data.excludeId);
  return c.json({ success: true, data: result });
});

adminRouter.post("/discounts", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(createDiscountSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount payload");
  }

  const bodyData = parsedBody.data;

  const result = await discountsService.createDiscount({
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

adminRouter.patch("/discounts/:discountId", async (c) => {
  const parsedParams = parseParams(discountIdParamSchema, { discountId: c.req.param("discountId") });
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(updateDiscountSchema, body);

  if (!parsedParams.success) {
    return validationError(c, "Invalid discount id");
  }

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount update payload");
  }

  const bodyData = parsedBody.data;

  const result = await discountsService.updateDiscount({
    id: parsedParams.data.discountId,
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

adminRouter.delete("/discounts/:discountId", async (c) => {
  const parsedParams = parseParams(discountIdParamSchema, { discountId: c.req.param("discountId") });

  if (!parsedParams.success) {
    return validationError(c, "Invalid discount id");
  }

  const result = await discountsService.deleteDiscount(parsedParams.data.discountId);
  return c.json(result, result.success ? 200 : 400);
});

adminRouter.post("/discounts/:discountId/assign", async (c) => {
  const parsedParams = parseParams(discountIdParamSchema, { discountId: c.req.param("discountId") });
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(discountUserAssignmentSchema, body);

  if (!parsedParams.success) {
    return validationError(c, "Invalid discount id");
  }

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount assignment payload");
  }

  const result = await discountsService.assignDiscountToUsers(parsedParams.data.discountId, parsedBody.data.userIds);
  return c.json(result, result.success ? 200 : 400);
});

adminRouter.post("/discounts/:discountId/remove", async (c) => {
  const parsedParams = parseParams(discountIdParamSchema, { discountId: c.req.param("discountId") });
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(discountUserAssignmentSchema, body);

  if (!parsedParams.success) {
    return validationError(c, "Invalid discount id");
  }

  if (!parsedBody.success) {
    return validationError(c, "Invalid discount removal payload");
  }

  const result = await discountsService.removeDiscountFromUsers(parsedParams.data.discountId, parsedBody.data.userIds);
  return c.json(result, result.success ? 200 : 400);
});

adminRouter.get("/discounts/search-users", async (c) => {
  const parsedQuery = parseQuery(searchUsersQuerySchema, {
    query: c.req.query("query"),
    limit: c.req.query("limit"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid discount search query");
  }

  const users = await discountsService.searchUsersForDiscount(parsedQuery.data.query, parsedQuery.data.limit);
  return c.json({ success: true, data: users });
});

adminRouter.get("/notifications", async (c) => {
  const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid notifications query");
  }

  const data = await notificationsService.getAllNotifications(parsedQuery.data.limit);
  return c.json({ success: true, data });
});

adminRouter.post("/notifications/send-all", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(sendNotificationBaseSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid notification payload");
  }

  const count = await notificationsService.sendNotificationToAllUsers({
    ...parsedBody.data,
  });

  return c.json({ success: true, data: { count } });
});

adminRouter.post("/notifications/send-users", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(sendNotificationToUsersSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid notification payload");
  }

  const count = await notificationsService.sendNotificationToUsers({
    ...parsedBody.data,
  });

  return c.json({ success: true, data: { count } });
});

app.route("/admin", adminRouter);

export { app };
