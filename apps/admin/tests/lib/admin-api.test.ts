import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
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
    apiRequestMock.mockResolvedValue({ success: true, data: { users: [], total: 0 } });
  });

  it("forwards trimmed search when fetching admin users", async () => {
    await getAdminUsersApi(50, 100, " alice@example.com ");

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/users?limit=50&offset=100&search=alice%40example.com");
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

  it("posts to the stop impersonation endpoint", async () => {
    await stopAdminImpersonationApi();

    expect(apiRequestMock).toHaveBeenCalledWith("/auth/admin/stop-impersonating", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });
});
