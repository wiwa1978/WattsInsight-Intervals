import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeAdminStepUpApi,
  getAdminStepUpStatusApi,
  prepareAdminTotpEnrollmentApi,
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
  getAdminBillingSubscriptionFinanceSummaryApi,
  getAdminBillingSubscriptionEventsApi,
  getAdminBillingSubscriptionPlanDistributionApi,
  getAdminBillingSubscriptionStatsApi,
  getAdminBillingSubscriptionsApi,
  getAdminUsersApi,
  stopAdminImpersonationApi,
} from "../../src/lib/api/admin";
import { apiRequest } from "../../src/lib/api/client";

vi.mock("../../src/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("admin API", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
    apiRequestMock.mockResolvedValue({ success: true, data: { users: [], total: 0 } });
  });

  it("forwards trimmed search when fetching admin users", async () => {
    await getAdminUsersApi(50, 100, " alice@example.com ");

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/users?limit=50&offset=100&search=alice%40example.com");
  });

  it("forwards role filter when fetching admin users", async () => {
    await getAdminUsersApi(20, 0, undefined, "admin");

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/users?limit=20&offset=0&role=admin");
  });

  it("encodes search email when fetching admin billing transactions", async () => {
    await getAdminAllTransactionsApi(20, 40, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/transactions?limit=20&offset=40&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("encodes search email when fetching admin billing purchases", async () => {
    await getAdminAllPurchasesApi(20, 60, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/purchases?limit=20&offset=60&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("encodes search email when fetching admin billing subscriptions", async () => {
    await getAdminBillingSubscriptionsApi(25, 50, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/subscriptions?limit=25&offset=50&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("fetches admin subscription billing stats", async () => {
    await getAdminBillingSubscriptionStatsApi();

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/billing/subscription-stats");
  });

  it("posts to the stop impersonation endpoint", async () => {
    await stopAdminImpersonationApi();

    expect(apiRequestMock).toHaveBeenCalledWith("/auth/admin/stop-impersonating", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });

  it("calls subscription billing endpoints", async () => {
    await getAdminBillingSubscriptionStatsApi();
    await getAdminBillingSubscriptionFinanceSummaryApi();
    await getAdminBillingSubscriptionPlanDistributionApi();
    await getAdminBillingSubscriptionEventsApi(25);
    await getAdminBillingSubscriptionsApi(20, 40, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/admin/billing/subscription-stats");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/admin/billing/subscription-finance-summary");
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/admin/billing/subscription-plan-distribution");
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/admin/billing/subscription-events?limit=25");
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      "/admin/billing/subscriptions?limit=20&offset=40&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("calls admin step-up endpoints", async () => {
    await getAdminStepUpStatusApi();
    await prepareAdminTotpEnrollmentApi({ secret: "secret" });
    await completeAdminStepUpApi({ secret: "secret", totpCode: "123456" });
    await completeAdminStepUpApi({ secret: "secret" });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/admin/step-up/status");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/admin/step-up/totp-enrollment", {
      method: "POST",
      body: JSON.stringify({ secret: "secret" }),
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/admin/step-up/complete", {
      method: "POST",
      body: JSON.stringify({ secret: "secret", totpCode: "123456" }),
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/admin/step-up/complete", {
      method: "POST",
      body: JSON.stringify({ secret: "secret" }),
    });
  });

  it("types step-up status to include allowlisted enrollment capability", async () => {
    apiRequestMock.mockResolvedValueOnce({
      success: true,
      data: {
        stepUpRequired: true,
        totpRequired: true,
        twoFactorEnabled: false,
        canEnrollTotp: true,
      },
    });

    const response = await getAdminStepUpStatusApi();

    expect(response.data.canEnrollTotp).toBe(true);
  });
});
