import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authState = {
    allowAuth: false,
    allowAdmin: false,
    allowAdminAccess: false,
    allowAdminStepUp: false,
    twoFactorEnabled: true,
  };

  const adminService = {
    getDashboardStats: vi.fn(),
    getUsers: vi.fn(),
    getUserStats: vi.fn(),
    getUserById: vi.fn(),
    getUserCreditBalance: vi.fn(),
    getUserCreditHistory: vi.fn(),
    getUserCreditPurchases: vi.fn(),
    getBillingStats: vi.fn(),
    getRevenueData: vi.fn(),
    getAllTransactions: vi.fn(),
    getAllPurchases: vi.fn(),
    getTransactionData: vi.fn(),
    getCreditsConsumedData: vi.fn(),
    verifyAdminBanSecret: vi.fn(),
    verifyAdminLoginSecret: vi.fn(),
  };

  const billingService = {
    getCreditBalance: vi.fn(),
    getCreditHistory: vi.fn(),
    getCreditPurchases: vi.fn(),
    getUserByEmail: vi.fn(),
    processCreditPurchase: vi.fn(),
    downloadInvoice: vi.fn(),
  };

  const notificationsService = {
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    markAllAsRead: vi.fn(),
    getAllNotifications: vi.fn(),
    sendNotificationToAllUsers: vi.fn(),
    sendNotificationToUsers: vi.fn(),
    createNotification: vi.fn(),
  };

  return {
    authState,
    adminService,
    billingService,
    notificationsService,
    env: {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
      APP_URL: "http://localhost:3100",
      API_URL: "http://localhost:8787",
      ADMIN_ALLOWLIST: "admin@example.com",
      DODO_PAYMENTS_ENVIRONMENT: "test_mode" as const,
      BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
      JWT_SECRET: "this-is-a-long-enough-jwt-secret",
      JWT_ISSUER: "api",
      JWT_AUDIENCE: "mobile-clients",
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 2592000,
    },
  };
});

vi.mock("../src/env", () => ({ env: mocks.env }));

vi.mock("@platform/auth-core", () => ({
  authAdditionalUserFields: {},
  createAuthModule: () => ({
    router: new Hono(),
    sessionRouter: new Hono(),
    mobileRouter: new Hono(),
    requireAuth: async (c: any, next: any) => {
      if (!mocks.authState.allowAuth) {
        return c.json({ success: false, error: "Unauthorized" }, 401);
      }
      c.set("authUser", { id: "u1", role: "admin", email: "admin@example.com" });
      await next();
    },
    requireAdmin: async (c: any, next: any) => {
      if (!mocks.authState.allowAdmin) {
        return c.json({ success: false, error: "Forbidden" }, 403);
      }
      await next();
    },
    requireAdminAccess: async (c: any, next: any) => {
      if (!mocks.authState.allowAdminAccess) {
        return c.json({ success: false, error: "Forbidden" }, 403);
      }
      await next();
    },
    requireAdminStepUp: async (c: any, next: any) => {
      if (!mocks.authState.allowAdminStepUp) {
        return c.json({ success: false, error: "Admin step-up required" }, 403);
      }
      await next();
    },
    auth: {
      api: {
        getSession: async () => ({ user: { twoFactorEnabled: mocks.authState.twoFactorEnabled } }),
        verifyTotp: async () => null,
      },
    },
  }),
}));

vi.mock("@platform/payments-core", () => ({ createPaymentsModule: () => ({ router: new Hono() }) }));
vi.mock("@platform/platform-db", () => ({
  account: {},
  auditEntries: {},
  creditPurchases: {},
  creditTransactions: {},
  createPlatformDb: () => ({ db: {} }),
  mobileRefreshToken: {},
  notification: {},
  session: {},
  user: {},
  userCredits: {},
  userDataExportRequests: {},
  userDiscounts: {},
  voucherAssignments: {},
  voucherRedemptions: {},
}));
vi.mock("@platform/email-core", () => ({ createEmailModule: () => ({ sendTemplate: vi.fn() }), createResendProvider: () => ({ send: vi.fn() }) }));
vi.mock("../src/modules/billing/service", () => ({ createBillingService: () => mocks.billingService }));
vi.mock("../src/modules/admin/service", () => ({ createAdminService: () => mocks.adminService }));
vi.mock("../src/modules/discounts/service", () => ({
  createDiscountsService: () => ({
    getDiscounts: vi.fn(),
    getDiscountById: vi.fn(),
    generateDiscountCode: vi.fn(),
    validateDiscountCode: vi.fn(),
    createDiscount: vi.fn(),
    updateDiscount: vi.fn(),
    deleteDiscount: vi.fn(),
    assignDiscountToUsers: vi.fn(),
    removeDiscountFromUsers: vi.fn(),
    searchUsersForDiscount: vi.fn(),
  }),
}));
vi.mock("../src/modules/notifications/service", () => ({ createNotificationsService: () => mocks.notificationsService }));

const { app } = await import("../src/app");

describe("authz contract", () => {
  beforeEach(() => {
    mocks.authState.allowAuth = false;
    mocks.authState.allowAdmin = false;
    mocks.authState.allowAdminAccess = false;
    mocks.authState.allowAdminStepUp = false;
    mocks.authState.twoFactorEnabled = true;
    vi.clearAllMocks();
  });

  // Ensures user-scoped routes hard-fail when no authenticated identity is present.
  it("rejects /me routes without auth", async () => {
    const res = await app.request("/me/credits/balance");
    expect(res.status).toBe(401);
  });

  // Ensures admin routes cannot be reached by authenticated non-admin users.
  it("rejects /admin routes without admin rights", async () => {
    mocks.authState.allowAuth = true;
    const res = await app.request("/admin/status");
    expect(res.status).toBe(403);
  });

  // Ensures privileged admin routes cannot be reached by lower-privilege identities.
  it("rejects /admin routes without allowlisted admin access", async () => {
    mocks.authState.allowAuth = true;
    const res = await app.request("/admin/status");
    expect(res.status).toBe(403);
  });

  // Ensures admin route works when all required guards are satisfied.
  it("allows /admin/status with required privileges", async () => {
    mocks.authState.allowAuth = true;
    mocks.authState.allowAdminAccess = true;

    const res = await app.request("/admin/status");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        message: "Admin access granted.",
        stepUpRequired: true,
        totpRequired: true,
        twoFactorEnabled: true,
        canEnrollTotp: true,
      },
    });
  });

  // Ensures admin dashboard endpoint enforces allowlisted admin access and returns delegated data.
  it("guards and serves /admin/dashboard/stats", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 10 });

    const forbidden = await app.request("/admin/dashboard/stats");
    expect(forbidden.status).toBe(401);

    mocks.authState.allowAuth = true;
    const stillForbidden = await app.request("/admin/dashboard/stats");
    expect(stillForbidden.status).toBe(403);

    mocks.authState.allowAdminAccess = true;
    mocks.authState.allowAdminStepUp = true;
    const ok = await app.request("/admin/dashboard/stats");
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ success: true, data: { totalUsers: 10 } });
  });

  // Ensures admin routes also enforce successful admin step-up verification.
  it("rejects /admin routes when step-up is missing", async () => {
    mocks.authState.allowAuth = true;
    mocks.authState.allowAdminAccess = true;
    mocks.authState.allowAdminStepUp = false;

    const res = await app.request("/admin/dashboard/stats");

    expect(res.status).toBe(403);
  });
});
