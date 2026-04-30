import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, haveIBeenPwned, magicLink, openAPI, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { passkey } from "@better-auth/passkey";
import { checkout, dodopayments, portal } from "@dodopayments/better-auth";
import { and, eq, isNull, lte } from "drizzle-orm";
import DodoPayments from "dodopayments";

import { authAdditionalUserFields, createAuthModule } from "@platform/auth-core";
import { createEmailModule, createResendProvider } from "@platform/email-core";
import { createPaymentsModule } from "@platform/payments-core";
import { createPlatformDb, mobileRefreshToken, user } from "@platform/platform-db";

import { authConfig } from "./config/auth";
import { buildSocialProviders } from "./config/auth-social-providers";
import { creditPackages } from "./config/billing";
import { env } from "./env";
import { getBillingMode } from "./lib/billing-mode";
import { getDodoCheckoutProductsForBillingMode } from "./lib/dodo-billing-products";
import { createAdminService } from "./modules/admin/service";
import { createAuditService } from "./modules/audit/service";
import { createBillingService } from "./modules/billing/service";
import { createDiscountsService } from "./modules/discounts/service";
import { createPaymentEventHandler } from "./modules/billing/payment-event-handler";
import { createSubscriptionService } from "./modules/billing/subscription-service";
import { createSubscriptionWebhookHandler } from "./modules/billing/subscription-webhooks";
import { createPaymentWebhookEventStore } from "./modules/payments/webhook-event-store";
import { createNotificationsService } from "./modules/notifications/service";
import { createVouchersService } from "./modules/vouchers/service";

const adminAllowlist = new Set(
  (env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

const { db } = createPlatformDb({
  connectionString: env.DATABASE_URL,
});
const auditService = createAuditService({ db });

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
const subscriptionService = createSubscriptionService({ db, env });
const adminService = createAdminService({
  db,
  adminBanSecret: env.ADMIN_BAN_SECRET,
});
const discountsService = createDiscountsService({
  db,
  env,
});
const vouchersService = createVouchersService({
  db,
  notifications: notificationsService,
});
const paymentWebhookEventStore = createPaymentWebhookEventStore({ db });

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
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: env.COOKIE_SAMESITE,
            domain: env.COOKIE_DOMAIN,
            path: "/",
          },
        },
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
    socialProviders: buildSocialProviders(env, authConfig),
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
      openAPI({
        disableDefaultReference: true,
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
                  products: getDodoCheckoutProductsForBillingMode(getBillingMode()),
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
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          banned: user.banned,
          banExpires: user.banExpires,
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
  webhookEventStore: paymentWebhookEventStore,
  async onWebhookFailure(event) {
    try {
      await auditService.recordAuditEntry({
        action: "billing.webhook.failure",
        outcome: "failure",
        targetType: "payment_webhook_event",
        targetId: event.providerEventId ?? null,
        metadata: {
          provider: event.provider,
          providerEventId: event.providerEventId ?? null,
          eventType: event.eventType ?? null,
          paymentId: event.paymentId ?? null,
          error: event.error,
        },
      });
    } catch {
      // Webhook audit failures must not mask webhook response behavior.
    }
  },
  onPaymentEvent: createPaymentEventHandler({
    creditPackages,
    billing: billingService,
    subscriptions: {
      handleDodoSubscriptionWebhook: createSubscriptionWebhookHandler({
        subscriptions: subscriptionService,
      }),
      recordSubscriptionPayment: subscriptionService.recordSubscriptionPayment,
    },
  }),
});

export const bootstrap = {
  db,
  authModule,
  adminService,
  auditService,
  billingService,
  subscriptionService,
  discountsService,
  notificationsService,
  vouchersService,
  paymentsModule,
};
