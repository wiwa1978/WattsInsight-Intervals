import { describe, expect, it, vi } from "vitest";

import {
  getAdminAllPurchases,
  getAdminAllTransactions,
  getAdminBillingStats,
  getAdminBillingSubscriptionEvents,
  getAdminBillingSubscriptionPlanDistribution,
  getAdminBillingSubscriptionStats,
  getAdminBillingSubscriptions,
  getAdminCreditsConsumedData,
  getAdminRevenueData,
  getAdminTransactionData,
  stopAdminImpersonation,
} from "../../src/lib/services/admin";
import {
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
  getAdminBillingStatsApi,
  getAdminBillingSubscriptionEventsApi,
  getAdminBillingSubscriptionPlanDistributionApi,
  getAdminBillingSubscriptionStatsApi,
  getAdminBillingSubscriptionsApi,
  getAdminCreditsConsumedDataApi,
  getAdminRevenueDataApi,
  getAdminTransactionDataApi,
  stopAdminImpersonationApi,
} from "../../src/lib/api/admin";
import { ApiRequestError } from "@platform/frontend-shared";

vi.mock("../../src/lib/api/admin", () => ({
  getAdminAllPurchasesApi: vi.fn(),
  getAdminAllTransactionsApi: vi.fn(),
  getAdminBillingStatsApi: vi.fn(),
  getAdminBillingSubscriptionEventsApi: vi.fn(),
  getAdminBillingSubscriptionPlanDistributionApi: vi.fn(),
  getAdminBillingSubscriptionStatsApi: vi.fn(),
  getAdminBillingSubscriptionsApi: vi.fn(),
  getAdminCreditsConsumedDataApi: vi.fn(),
  getAdminRevenueDataApi: vi.fn(),
  getAdminTransactionDataApi: vi.fn(),
  stopAdminImpersonationApi: vi.fn(),
}));

const getAdminAllPurchasesApiMock = vi.mocked(getAdminAllPurchasesApi);
const getAdminAllTransactionsApiMock = vi.mocked(getAdminAllTransactionsApi);
const getAdminBillingStatsApiMock = vi.mocked(getAdminBillingStatsApi);
const getAdminBillingSubscriptionEventsApiMock = vi.mocked(getAdminBillingSubscriptionEventsApi);
const getAdminBillingSubscriptionPlanDistributionApiMock = vi.mocked(getAdminBillingSubscriptionPlanDistributionApi);
const getAdminBillingSubscriptionStatsApiMock = vi.mocked(getAdminBillingSubscriptionStatsApi);
const getAdminBillingSubscriptionsApiMock = vi.mocked(getAdminBillingSubscriptionsApi);
const getAdminCreditsConsumedDataApiMock = vi.mocked(getAdminCreditsConsumedDataApi);
const getAdminRevenueDataApiMock = vi.mocked(getAdminRevenueDataApi);
const getAdminTransactionDataApiMock = vi.mocked(getAdminTransactionDataApi);
const stopAdminImpersonationApiMock = vi.mocked(stopAdminImpersonationApi);

const disabledCreditsError = new ApiRequestError({
  status: 400,
  message: "API request failed (400): Billing mode disabled: credits",
});

const disabledSubscriptionsError = new ApiRequestError({
  status: 400,
  message: "API request failed (400): Billing mode disabled: subscriptions",
});

describe("admin services", () => {
  it("delegates stopping impersonation to the admin API", async () => {
    const response = { user: { id: "admin-user" } };
    stopAdminImpersonationApiMock.mockResolvedValue(response);

    await expect(stopAdminImpersonation()).resolves.toBe(response);
    expect(stopAdminImpersonationApiMock).toHaveBeenCalledOnce();
  });

  it("returns empty credit chart data when credit billing is disabled", async () => {
    getAdminTransactionDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminCreditsConsumedDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminRevenueDataApiMock.mockRejectedValue(disabledCreditsError);

    await expect(getAdminTransactionData("daily")).resolves.toEqual([]);
    await expect(getAdminCreditsConsumedData("daily")).resolves.toEqual([]);
    await expect(getAdminRevenueData("daily")).resolves.toEqual([]);
  });

  it("returns empty credit billing data when credit billing is disabled", async () => {
    getAdminBillingStatsApiMock.mockRejectedValue(disabledCreditsError);
    getAdminAllTransactionsApiMock.mockRejectedValue(disabledCreditsError);
    getAdminAllPurchasesApiMock.mockRejectedValue(disabledCreditsError);

    await expect(getAdminBillingStats()).resolves.toEqual({
      totalPurchases: 0,
      totalCreditsPurchased: 0,
      purchasedCredits: 0,
      bonusCredits: 0,
      totalCreditsConsumed: 0,
      totalRevenue: 0,
    });
    await expect(getAdminAllTransactions()).resolves.toEqual({ transactions: [], total: 0, hasMore: false });
    await expect(getAdminAllPurchases()).resolves.toEqual({ purchases: [], total: 0, hasMore: false });
  });

  it("returns empty subscription billing data when subscription billing is disabled", async () => {
    getAdminBillingSubscriptionStatsApiMock.mockRejectedValue(disabledSubscriptionsError);
    getAdminBillingSubscriptionsApiMock.mockRejectedValue(disabledSubscriptionsError);
    getAdminBillingSubscriptionPlanDistributionApiMock.mockRejectedValue(disabledSubscriptionsError);
    getAdminBillingSubscriptionEventsApiMock.mockRejectedValue(disabledSubscriptionsError);

    await expect(getAdminBillingSubscriptionStats()).resolves.toEqual({
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      trialingSubscriptions: 0,
      pastDueSubscriptions: 0,
      canceledSubscriptions: 0,
      monthlyRecurringRevenue: 0,
      annualRecurringRevenue: 0,
    });
    await expect(getAdminBillingSubscriptions()).resolves.toEqual({ subscriptions: [], total: 0, hasMore: false });
    await expect(getAdminBillingSubscriptionPlanDistribution()).resolves.toEqual([]);
    await expect(getAdminBillingSubscriptionEvents()).resolves.toEqual([]);
  });
});
