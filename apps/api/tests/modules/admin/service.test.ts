import { afterEach, describe, expect, it, vi } from "vitest";

import { createAdminService } from "../../../src/modules/admin/service";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAdminService", () => {
  // Verifies whitespace-only ban secret input is rejected before comparison.
  it("rejects empty secret input", async () => {
    const service = createAdminService({
      db: {},
      adminBanSecret: "secret",
    });

    const result = await service.verifyAdminBanSecret("   ");

    expect(result).toEqual({ success: false, error: "Secret key is required." });
  });

  // Verifies incorrect ban secret values are rejected with a deterministic error.
  it("rejects invalid secret input", async () => {
    const service = createAdminService({
      db: {},
      adminBanSecret: "secret",
    });

    const result = await service.verifyAdminBanSecret("wrong1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid secret key provided.");
  });

  // Verifies exact secret matches are accepted.
  it("accepts valid secret input", async () => {
    const service = createAdminService({
      db: {},
      adminBanSecret: "secret",
    });

    const result = await service.verifyAdminBanSecret("secret");

    expect(result).toEqual({ success: true, error: undefined });
  });

  // Verifies missing server configuration fails closed for secret validation.
  it("returns configuration error when admin secret is missing", async () => {
    const service = createAdminService({
      db: {},
    });

    const result = await service.verifyAdminBanSecret("anything");

    expect(result).toEqual({
      success: false,
      error: "Admin ban secret is not configured.",
    });
  });

  // Verifies unknown users return null rather than throwing.
  it("returns null for unknown user in getUserById", async () => {
    const service = createAdminService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
      adminBanSecret: "secret",
    } as any);

    const result = await service.getUserById("missing-user");
    expect(result).toBeNull();
  });

  // Verifies cents-based revenue is converted to euros in response payloads.
  it("maps billing stats and converts cents to EUR", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 7, total: 12345, purchased: 900, bonus: 100 }]),
        }),
      }),
    };

    const service = createAdminService({
      db,
      adminBanSecret: "secret",
    });

    const stats = await service.getBillingStats();
    expect(stats.totalPurchases).toBe(7);
    expect(stats.totalRevenue).toBe(123.45);
  });

  // Verifies paginated transaction responses include hasMore based on total count.
  it("builds pagination response for transactions", async () => {
    const transactionRows = [{ id: "t1" }, { id: "t2" }];

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(transactionRows),
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 10 }]),
          }),
        }),
      });

    const service = createAdminService({
      db: { select } as any,
      adminBanSecret: "secret",
    });

    const result = await service.getAllTransactions(2, 0);
    expect(result.transactions).toEqual(transactionRows);
    expect(result.total).toBe(10);
    expect(result.hasMore).toBe(true);
  });

  // Verifies transaction pagination inputs are normalized before reaching the query builder.
  it("normalizes transaction pagination inputs", async () => {
    const limit = vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });

    const totalWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const totalInnerJoin = vi.fn().mockReturnValue({ where: totalWhere });
    const totalFrom = vi.fn().mockReturnValue({ innerJoin: totalInnerJoin });

    const select = vi.fn()
      .mockReturnValueOnce({ from })
      .mockReturnValueOnce({ from: totalFrom });

    const service = createAdminService({
      db: { select } as any,
      adminBanSecret: "secret",
    });

    await service.getAllTransactions(999, -50, "  john@example.com  ");

    expect(limit).toHaveBeenCalledWith(100);
    expect(where).toHaveBeenCalled();
  });

  // Verifies the broad user list is capped to avoid unbounded responses.
  it("caps admin user listing", async () => {
    const listLimit = vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) });
    const listOrderBy = vi.fn().mockReturnValue({ limit: listLimit });
    const listFrom = vi.fn().mockReturnValue({ orderBy: listOrderBy });

    const countFrom = vi.fn().mockResolvedValue([{ count: 0 }]);

    const select = vi.fn()
      .mockReturnValueOnce({ from: listFrom })
      .mockReturnValueOnce({ from: countFrom });

    const service = createAdminService({
      db: { select } as any,
      adminBanSecret: "secret",
    });

    await service.getUsers();

    expect(listLimit).toHaveBeenCalledWith(20);
  });

  // Verifies admin user search is applied consistently to list and count queries.
  it("filters admin user listing by trimmed name or email search", async () => {
    const listRows = [{ id: "u1", name: "Alice", email: "alice@example.com" }];
    const listOffset = vi.fn().mockResolvedValue(listRows);
    const listLimit = vi.fn().mockReturnValue({ offset: listOffset });
    const listOrderBy = vi.fn().mockReturnValue({ limit: listLimit });
    const listWhere = vi.fn().mockReturnValue({ orderBy: listOrderBy });
    const listFrom = vi.fn().mockReturnValue({ where: listWhere, orderBy: listOrderBy });

    const countRows = [{ count: 1 }];
    const countWhere = vi.fn().mockResolvedValue(countRows);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });

    const select = vi.fn()
      .mockReturnValueOnce({ from: listFrom })
      .mockReturnValueOnce({ from: countFrom });

    const service = createAdminService({
      db: { select } as any,
      adminBanSecret: "secret",
    });

    const result = await service.getUsers(20, 0, "  alice  ");

    expect(listWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledWith(listWhere.mock.calls[0]?.[0]);
    expect(result).toEqual({ users: listRows, total: 1 });
  });
});
