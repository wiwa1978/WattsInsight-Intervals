import { describe, expect, it, vi } from "vitest";

import {
  getAdminCreditsConsumedData,
  getAdminRevenueData,
  getAdminTransactionData,
  stopAdminImpersonation,
} from "../../src/lib/services/admin";
import {
  getAdminCreditsConsumedDataApi,
  getAdminRevenueDataApi,
  getAdminTransactionDataApi,
  stopAdminImpersonationApi,
} from "../../src/lib/api/admin";
import { ApiRequestError } from "@platform/frontend-shared";

vi.mock("../../src/lib/api/admin", () => ({
  getAdminCreditsConsumedDataApi: vi.fn(),
  getAdminRevenueDataApi: vi.fn(),
  getAdminTransactionDataApi: vi.fn(),
  stopAdminImpersonationApi: vi.fn(),
}));

const getAdminCreditsConsumedDataApiMock = vi.mocked(getAdminCreditsConsumedDataApi);
const getAdminRevenueDataApiMock = vi.mocked(getAdminRevenueDataApi);
const getAdminTransactionDataApiMock = vi.mocked(getAdminTransactionDataApi);
const stopAdminImpersonationApiMock = vi.mocked(stopAdminImpersonationApi);

describe("admin services", () => {
  it("delegates stopping impersonation to the admin API", async () => {
    const response = { user: { id: "admin-user" } };
    stopAdminImpersonationApiMock.mockResolvedValue(response);

    await expect(stopAdminImpersonation()).resolves.toBe(response);
    expect(stopAdminImpersonationApiMock).toHaveBeenCalledOnce();
  });

  it("returns empty credit chart data when credit billing is disabled", async () => {
    const disabledCreditsError = new ApiRequestError({
      status: 400,
      message: "API request failed (400): Billing mode disabled: credits",
    });
    getAdminTransactionDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminCreditsConsumedDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminRevenueDataApiMock.mockRejectedValue(disabledCreditsError);

    await expect(getAdminTransactionData("daily")).resolves.toEqual([]);
    await expect(getAdminCreditsConsumedData("daily")).resolves.toEqual([]);
    await expect(getAdminRevenueData("daily")).resolves.toEqual([]);
  });
});
