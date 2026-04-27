import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminUsersApi } from "../../src/lib/api/admin";
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
});
