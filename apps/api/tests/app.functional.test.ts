import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const billingService = {
    getCreditBalance: vi.fn(),
    getCreditHistory: vi.fn(),
    getCreditPurchases: vi.fn(),
    downloadInvoice: vi.fn(),
    processCreditPurchase: vi.fn(),
    getUserByEmail: vi.fn(),
  };

  const adminService = {
    verifyAdminBanSecret: vi.fn(),
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

  const discountsService = {
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
  };

  return {
    billingService,
    adminService,
    notificationsService,
    discountsService,
    env: {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
      APP_URL: "http://localhost:3100",
      API_URL: "http://localhost:8787",
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

vi.mock("../src/modules/billing/service", () => ({
  createBillingService: () => mocks.billingService,
}));

vi.mock("../src/modules/admin/service", () => ({
  createAdminService: () => mocks.adminService,
}));

vi.mock("../src/modules/notifications/service", () => ({
  createNotificationsService: () => mocks.notificationsService,
}));

vi.mock("../src/modules/discounts/service", () => ({
  createDiscountsService: () => mocks.discountsService,
}));

vi.mock("@platform/auth-core", () => ({
  authAdditionalUserFields: {},
  createAuthModule: () => {
    const router = new Hono();
    router.post("/sign-in/email", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }
      return c.json({ success: true, data: { token: "session-token" } });
    });

    const mobileRouter = new Hono();
    mobileRouter.post("/token", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }
      return c.json({ success: true, data: { accessToken: "a", refreshToken: "r" } });
    });
    mobileRouter.post("/refresh", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { refreshToken?: string } | null;
      if (body?.refreshToken !== "refresh-good") {
        return c.json({ success: false, error: "Invalid refresh token" }, 401);
      }
      return c.json({ success: true, data: { accessToken: "a2", refreshToken: "r2" } });
    });
    mobileRouter.post("/revoke", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { refreshToken?: string } | null;
      if (body?.refreshToken !== "refresh-good") {
        return c.json({ success: false, error: "Invalid refresh token" }, 401);
      }
      return c.json({ success: true, data: { revoked: true } });
    });

    const passThrough = async (c: any, next: any) => {
      c.set("authUser", { id: "auth-user" });
      await next();
    };

    return {
      router,
      sessionRouter: new Hono(),
      mobileRouter,
      requireAuth: passThrough,
      requireAdmin: passThrough,
      requireAdminAccess: passThrough,
    };
  },
}));

vi.mock("@platform/payments-core", () => ({
  createPaymentsModule: () => {
    const router = new Hono();
    router.post("/webhooks/dodo", async (c) => {
      if (c.req.header("x-dodo-signature") !== "valid") {
        return c.json({ success: false, error: "Invalid signature" }, 401);
      }
      return c.json({ success: true, data: { processed: true } });
    });
    return { router };
  },
}));

vi.mock("@platform/platform-db", () => ({
  createPlatformDb: () => ({ db: {} }),
  mobileRefreshToken: {},
}));

vi.mock("@platform/email-core", () => ({
  createEmailModule: () => ({ sendTemplate: vi.fn() }),
  createResendProvider: () => ({ send: vi.fn() }),
}));

vi.mock("../src/observability/sentry", () => ({
  setupSentry: vi.fn(),
  Sentry: {
    withSentry: vi.fn(async (fn: any, c: any) => fn(c)),
  },
}));

const { app } = await import("../src/app");

describe("API functional routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Verifies the health endpoint always reports service readiness.
  it("returns health status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { status: "ok" },
    });
  });

  // Verifies that email sign-in rejects incomplete credentials with a 401.
  it("rejects email sign-in with missing credentials", async () => {
    const res = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies that email sign-in accepts valid credentials.
  it("accepts email sign-in with valid credentials", async () => {
    const res = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com", password: "secret" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies mobile token exchange rejects invalid payloads.
  it("rejects mobile token request with invalid payload", async () => {
    const res = await app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies mobile token exchange succeeds with valid credentials.
  it("issues mobile tokens with valid credentials", async () => {
    const res = await app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com", password: "secret" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies refresh token endpoint rejects invalid request bodies.
  it("rejects mobile refresh with invalid request body", async () => {
    const res = await app.request("/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies refresh token endpoint rotates tokens for valid request body.
  it("refreshes mobile token with valid request body", async () => {
    const res = await app.request("/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-good" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies revoke endpoint requires a valid request body.
  it("rejects mobile revoke with invalid request body", async () => {
    const res = await app.request("/auth/mobile/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies revoke endpoint accepts a valid request body.
  it("revokes mobile token with valid request body", async () => {
    const res = await app.request("/auth/mobile/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-good" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies webhook endpoint blocks requests with invalid signatures.
  it("rejects dodo webhook with invalid signature", async () => {
    const res = await app.request("/payments/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "invalid" },
    });
    expect(res.status).toBe(401);
  });

  // Verifies webhook endpoint accepts signed requests.
  it("accepts dodo webhook with valid signature", async () => {
    const res = await app.request("/payments/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "valid" },
    });
    expect(res.status).toBe(200);
  });

  // Verifies checkout endpoint rejects requests without packageKey.
  it("validates packageKey for checkout", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Invalid checkout payload",
    });
  });

  // Verifies OpenAPI endpoints are equivalent and contain all declared contract paths.
  it("serves OpenAPI specs on both endpoints", async () => {
    const [rootRes, apiRes] = await Promise.all([
      app.request("/openapi.json"),
      app.request("/api/openapi.json"),
    ]);

    expect(rootRes.status).toBe(200);
    expect(apiRes.status).toBe(200);

    const rootSpec = await rootRes.json();
    const apiSpec = await apiRes.json();

    expect(rootSpec.openapi).toBe("3.1.0");
    expect(rootSpec.info?.title).toBe("SaaS Platform API");
    expect(rootSpec.paths?.["/me/credits/balance"]?.get).toBeTruthy();
    expect(rootSpec.paths?.["/me/session"]?.get).toBeTruthy();
    expect(rootSpec.paths?.["/admin/session"]?.get).toBeTruthy();
    expect(rootSpec.paths?.["/health"]?.get).toBeTruthy();
    expect(rootSpec.paths?.["/auth/sign-in/email"]?.post).toBeTruthy();
    expect(rootSpec.paths?.["/auth/mobile/token"]?.post).toBeTruthy();
    expect(rootSpec.paths?.["/auth/mobile/refresh"]?.post).toBeTruthy();
    expect(rootSpec.paths?.["/auth/mobile/revoke"]?.post).toBeTruthy();
    expect(rootSpec.paths?.["/admin/dashboard/stats"]?.get).toBeTruthy();
    expect(rootSpec.paths?.["/webhooks/dodo-payments"]?.post).toBeTruthy();
    expect(apiSpec).toEqual(rootSpec);

    const openApiPaths = Object.keys(rootSpec.paths || {});
    expect(openApiPaths.sort()).toEqual([
      "/admin/dashboard/stats",
      "/admin/session",
      "/auth/mobile/refresh",
      "/auth/mobile/revoke",
      "/auth/mobile/token",
      "/auth/sign-in/email",
      "/countries",
      "/health",
      "/me/credits/balance",
      "/me/session",
      "/webhooks/dodo-payments",
    ]);
  });

  // Verifies admin dashboard endpoint returns delegated stats payload.
  it("returns admin dashboard stats", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 42 });
    const res = await app.request("/admin/dashboard/stats");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { totalUsers: 42 } });
  });

  // Verifies admin dashboard endpoint returns delegated stats payload.
  it("returns admin dashboard stats for privileged admin console", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 99 });
    const res = await app.request("/admin/dashboard/stats");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { totalUsers: 99 } });
  });

  // Verifies checkout endpoint returns package-specific dodo checkout URL.
  it("returns checkout URL for known package", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "silver" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        checkoutUrl: "https://test.checkout.dodopayments.com/buy/pdt_0NUzkvLtA4UmSIekBVTcX",
      },
    });
  });

  // Verifies user detail endpoint returns 404 for unknown users.
  it("returns 404 for unknown admin user", async () => {
    mocks.adminService.getUserById.mockResolvedValueOnce(null);

    const userId = "11111111-1111-4111-8111-111111111111";
    const res = await app.request(`/admin/users/${userId}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ success: false, error: "User not found" });
    expect(mocks.adminService.getUserById).toHaveBeenCalledWith(userId);
  });

  // Verifies user detail endpoint returns serialized user for existing IDs.
  it("returns user detail for known admin user", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: userId, email: "john@example.com" });

    const res = await app.request(`/admin/users/${userId}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { id: userId, email: "john@example.com" },
    });
  });

  // Verifies billing stats endpoint forwards service result without mutation.
  it("returns billing stats from admin service", async () => {
    mocks.adminService.getBillingStats.mockResolvedValueOnce({ totalPurchases: 10, totalRevenue: 123.45 });

    const res = await app.request("/admin/billing/stats");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { totalPurchases: 10, totalRevenue: 123.45 },
    });
  });

  // Verifies revenue endpoint parses and forwards timeRange query parameters.
  it("passes timeRange to revenue endpoint", async () => {
    mocks.adminService.getRevenueData.mockResolvedValueOnce([{ period: "2026-01-01", revenue: 100 }]);

    const res = await app.request("/admin/billing/revenue?timeRange=monthly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getRevenueData).toHaveBeenCalledWith("monthly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-01-01", revenue: 100 }],
    });
  });

  // Verifies transactions endpoint forwards limit, offset and search filters.
  it("passes pagination and search to billing transactions endpoint", async () => {
    mocks.adminService.getAllTransactions.mockResolvedValueOnce({
      transactions: [{ id: "t1" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/transactions?limit=5&offset=10&searchEmail=john@example.com");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getAllTransactions).toHaveBeenCalledWith(5, 10, "john@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { transactions: [{ id: "t1" }], total: 1, hasMore: false },
    });
  });

  // Verifies transactions endpoint validates out-of-range query parameters.
  it("validates billing transaction query parameters", async () => {
    const res = await app.request("/admin/billing/transactions?limit=1000&offset=-1");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid transactions query" });
  });

  // Verifies purchases endpoint forwards limit, offset and search filters.
  it("passes pagination and search to billing purchases endpoint", async () => {
    mocks.adminService.getAllPurchases.mockResolvedValueOnce({
      purchases: [{ id: "p1" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/purchases?limit=2&offset=0&searchEmail=acme@example.com");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getAllPurchases).toHaveBeenCalledWith(2, 0, "acme@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { purchases: [{ id: "p1" }], total: 1, hasMore: false },
    });
  });

  // Verifies transaction chart endpoint returns shaped chart payload.
  it("returns transactions chart data", async () => {
    mocks.adminService.getTransactionData.mockResolvedValueOnce([{ period: "2026-03-01", count: 9 }]);

    const res = await app.request("/admin/billing/transactions-chart?timeRange=weekly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getTransactionData).toHaveBeenCalledWith("weekly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-03-01", count: 9 }],
    });
  });

  // Verifies credits-consumed chart endpoint returns shaped chart payload.
  it("returns credits consumed chart data", async () => {
    mocks.adminService.getCreditsConsumedData.mockResolvedValueOnce([{ period: "2026-03-01", consumed: 42 }]);

    const res = await app.request("/admin/billing/credits-consumed-chart?timeRange=yearly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getCreditsConsumedData).toHaveBeenCalledWith("yearly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-03-01", consumed: 42 }],
    });
  });

  // Verifies user listing and stats endpoints both return service payloads.
  it("returns admin users list and stats", async () => {
    mocks.adminService.getUsers.mockResolvedValueOnce([{ id: "u1" }]);
    mocks.adminService.getUserStats.mockResolvedValueOnce({ totalAdmins: 2, totalBanned: 1 });

    const usersRes = await app.request("/admin/users");
    const statsRes = await app.request("/admin/users/stats");

    expect(usersRes.status).toBe(200);
    expect(statsRes.status).toBe(200);
    await expect(usersRes.json()).resolves.toEqual({ success: true, data: [{ id: "u1" }] });
    await expect(statsRes.json()).resolves.toEqual({ success: true, data: { totalAdmins: 2, totalBanned: 1 } });
  });

  // Verifies user credit sub-resources all return expected payloads.
  it("returns admin user credit endpoints", async () => {
    mocks.adminService.getUserCreditBalance.mockResolvedValueOnce({ balance: 50 });
    mocks.adminService.getUserCreditHistory.mockResolvedValueOnce([{ id: "h1" }]);
    mocks.adminService.getUserCreditPurchases.mockResolvedValueOnce([{ id: "cp1" }]);

    const userId = "11111111-1111-4111-8111-111111111111";
    const balanceRes = await app.request(`/admin/users/${userId}/credits/balance`);
    const historyRes = await app.request(`/admin/users/${userId}/credits/history`);
    const purchasesRes = await app.request(`/admin/users/${userId}/credits/purchases`);

    expect(balanceRes.status).toBe(200);
    expect(historyRes.status).toBe(200);
    expect(purchasesRes.status).toBe(200);
    await expect(balanceRes.json()).resolves.toEqual({ success: true, data: { balance: 50 } });
    await expect(historyRes.json()).resolves.toEqual({ success: true, data: [{ id: "h1" }] });
    await expect(purchasesRes.json()).resolves.toEqual({ success: true, data: [{ id: "cp1" }] });
  });

  // Verifies malformed user identifiers are rejected before service calls.
  it("validates malformed admin user ids", async () => {
    const res = await app.request("/admin/users/not-a-uuid");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid user id" });
  });

  // Verifies verify-ban-secret maps service success/failure to HTTP status.
  it("handles verify-ban-secret success and failure status codes", async () => {
    mocks.adminService.verifyAdminBanSecret.mockResolvedValueOnce({ success: true });
    mocks.adminService.verifyAdminBanSecret.mockResolvedValueOnce({ success: false, error: "Invalid secret key provided." });

    const okRes = await app.request("/admin/verify-ban-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "good" }),
    });
    const failRes = await app.request("/admin/verify-ban-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "bad" }),
    });

    expect(okRes.status).toBe(200);
    expect(failRes.status).toBe(400);
  });

  // Verifies verify-ban-secret rejects malformed payloads.
  it("validates verify-ban-secret payload", async () => {
    const res = await app.request("/admin/verify-ban-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid secret payload" });
  });

  // Verifies discount code validation endpoint rejects malformed input.
  it("validates discount code request body", async () => {
    const res = await app.request("/admin/discounts/validate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid discount validation payload" });
  });

  // Verifies discount CRUD and assignment routes are all wired and callable.
  it("routes discount CRUD and assignment operations", async () => {
    mocks.discountsService.createDiscount.mockResolvedValueOnce({ success: true, data: { id: "d1" } });
    mocks.discountsService.updateDiscount.mockResolvedValueOnce({ success: true, data: { id: "d1" } });
    mocks.discountsService.deleteDiscount.mockResolvedValueOnce({ success: true });
    mocks.discountsService.assignDiscountToUsers.mockResolvedValueOnce({ success: true });
    mocks.discountsService.removeDiscountFromUsers.mockResolvedValueOnce({ success: true });

    const createRes = await app.request("/admin/discounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE-ABC-1234",
        type: "percentage",
        value: 10,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      }),
    });

    const discountId = "33333333-3333-4333-8333-333333333333";
    const userIds = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];

    const patchRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 20 }),
    });

    const assignRes = await app.request(`/admin/discounts/${discountId}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds }),
    });

    const removeRes = await app.request(`/admin/discounts/${discountId}/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [userIds[0]] }),
    });

    const deleteRes = await app.request(`/admin/discounts/${discountId}`, { method: "DELETE" });

    expect(createRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    expect(assignRes.status).toBe(200);
    expect(removeRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
  });

  // Verifies notification list and dispatch routes map to service calls.
  it("routes notifications endpoints", async () => {
    mocks.notificationsService.getAllNotifications.mockResolvedValueOnce([{ id: "n1" }]);
    mocks.notificationsService.sendNotificationToAllUsers.mockResolvedValueOnce(5);
    mocks.notificationsService.sendNotificationToUsers.mockResolvedValueOnce(2);

    const listRes = await app.request("/admin/notifications?limit=10");
    const sendAllRes = await app.request("/admin/notifications/send-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "T", message: "M" }),
    });
    const sendUsersRes = await app.request("/admin/notifications/send-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: ["66666666-6666-4666-8666-666666666666"], title: "T", message: "M" }),
    });

    expect(listRes.status).toBe(200);
    expect(sendAllRes.status).toBe(200);
    expect(sendUsersRes.status).toBe(200);
    await expect(listRes.json()).resolves.toEqual({ success: true, data: [{ id: "n1" }] });
    await expect(sendAllRes.json()).resolves.toEqual({ success: true, data: { count: 5 } });
    await expect(sendUsersRes.json()).resolves.toEqual({ success: true, data: { count: 2 } });
  });

  // Verifies malformed notification payloads now return 400 instead of 500.
  it("returns 400 when send-users payload is malformed", async () => {
    const res = await app.request("/admin/notifications/send-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", message: "y" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid notification payload" });
  });

  // Verifies invoice endpoint rejects malformed payloads.
  it("validates invoice payload", async () => {
    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Invalid invoice payload",
    });
  });

  // Verifies invoice endpoint normalizes thrown service errors into 400 responses.
  it("maps invoice errors to 400 response", async () => {
    mocks.billingService.downloadInvoice.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.billingService.downloadInvoice).toHaveBeenCalledWith("auth-user", "pay_1");
  });

  // Verifies invoice endpoint returns successful invoice payload unchanged.
  it("returns invoice payload on success", async () => {
    mocks.billingService.downloadInvoice.mockResolvedValueOnce({
      success: true,
      invoiceUrl: "https://invoices.test/file.pdf",
    });

    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_2" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      invoiceUrl: "https://invoices.test/file.pdf",
    });
  });

  // Verifies checkout rejects unknown package keys with a validation error.
  it("rejects checkout for unknown package key", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "not-a-package" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Unknown package" });
  });

  // Verifies client log endpoint rejects malformed payloads.
  it("rejects malformed client log payload", async () => {
    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "oops", message: "" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid log payload" });
  });

  // Verifies client log endpoint accepts minimal valid payloads.
  it("accepts valid client log payload", async () => {
    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "info", message: "client mounted" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  // Verifies discount code generation endpoint maps service errors to 400 responses.
  it("maps generate-code failures to 400", async () => {
    mocks.discountsService.generateDiscountCode.mockRejectedValueOnce(new Error("generator failed"));

    const res = await app.request("/admin/discounts/generate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overridePrefix: "PROMO" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "generator failed" });
  });

  // Verifies discount code generation endpoint returns generated code on success.
  it("returns generated discount code", async () => {
    mocks.discountsService.generateDiscountCode.mockResolvedValueOnce("PROMO-AAA-BBBB");

    const res = await app.request("/admin/discounts/generate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overridePrefix: "PROMO" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { code: "PROMO-AAA-BBBB" } });
  });

  // Verifies discount lookup endpoint validates malformed identifiers.
  it("validates discount identifiers", async () => {
    const res = await app.request("/admin/discounts/missing");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid discount id" });
  });

  // Verifies discount lookup endpoint returns 404 when service reports missing discount.
  it("returns 404 for missing discount by id", async () => {
    mocks.discountsService.getDiscountById.mockResolvedValueOnce({ success: false, discount: null, error: "Discount not found" });

    const res = await app.request("/admin/discounts/11111111-1111-4111-8111-111111111111");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ success: false, discount: null, error: "Discount not found" });
  });

  // Verifies discount assignment validates identifiers before payload fallback logic.
  it("validates assignment payload", async () => {
    const res = await app.request("/admin/discounts/d1/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid discount id" });
  });

  // Verifies discount removal validates identifiers before payload fallback logic.
  it("validates removal payload", async () => {
    const res = await app.request("/admin/discounts/d1/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid discount id" });
  });

  // Verifies discount validation endpoint passes excludeId and code to service.
  it("forwards discount validation payload to service", async () => {
    mocks.discountsService.validateDiscountCode.mockResolvedValueOnce({ valid: true });

    const res = await app.request("/admin/discounts/validate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "SAVE10", excludeId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.discountsService.validateDiscountCode).toHaveBeenCalledWith("SAVE10", "11111111-1111-4111-8111-111111111111");
  });

});
