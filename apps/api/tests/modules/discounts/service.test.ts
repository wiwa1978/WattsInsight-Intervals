import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDiscountsService } from "../../../src/modules/discounts/service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createDiscountsService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  // Verifies discount creation enforces chronological date windows.
  it("rejects create discount when endDate is before startDate", async () => {
    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn() } } } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.createDiscount({
      code: "SAVE10",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-01-01"),
    });

    expect(result).toEqual({ success: false, error: "End date must be after start date" });
  });

  // Verifies fixed discounts are rejected because the provider only supports percentages.
  it("rejects fixed discounts", async () => {
    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn() } } } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.createDiscount({
      code: "SAVE-ABC-1234",
      type: "fixed",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
    });

    expect(result).toEqual({ success: false, error: "Only percentage discounts are supported" });
  });

  // Verifies discount creation performs remote sync and stores an inferred active status.
  it("creates discount and infers active status", async () => {
    const now = Date.now();
    const insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "d1", status: "active" }]),
      }),
    }));
    const tx = { insert };
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    const result = await service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date(now - 10_000),
      endDate: new Date(now + 10_000),
      maxUses: 100,
      userIds: ["u1", "u2"],
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as any).mock.calls[1][0]).toContain("https://test.dodopayments.com/discounts");
    expect((fetch as any).mock.calls[1][1].body).toContain("SAVE-ABC-1234");
    expect((fetch as any).mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  // Verifies a remote discount is deleted when local persistence fails after provider creation.
  it("cleans up dodo discount when local creation fails", async () => {
    const localError = new Error("local insert failed");
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn().mockRejectedValue(localError),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204, text: vi.fn().mockResolvedValue("") });

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    await expect(service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
    })).rejects.toThrow("local insert failed");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect((fetch as any).mock.calls[2][0]).toContain("/discounts/dodo_1");
    expect((fetch as any).mock.calls[2][1]).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  // Verifies cleanup errors do not hide the original local persistence failure.
  it("preserves local creation failure when dodo cleanup fails", async () => {
    const localError = new Error("assignment insert failed");
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn().mockRejectedValue(localError),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("provider details"),
    });

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    await expect(service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
      userIds: ["11111111-1111-4111-8111-111111111111"],
    })).rejects.toThrow("assignment insert failed");

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  // Verifies remote validation failures do not fail open anymore.
  it("fails closed when dodo validation errors", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network failure"));

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    await expect(service.validateDiscountCode("SAVE-ABC-1234")).rejects.toThrow("Dodo provider request failed");
  });

  // Verifies provider response bodies are never leaked through errors.
  it("sanitizes dodo provider response failures", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("provider secret details"),
    });

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    let error: unknown;
    try {
      await service.validateDiscountCode("SAVE-ABC-1234");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Dodo provider request failed");
    expect((error as Error).message).not.toContain("provider secret details");
  });

  // Verifies provider timeouts have a stable sanitized error.
  it("sanitizes dodo provider timeouts", async () => {
    (fetch as any).mockRejectedValueOnce(new DOMException("The operation timed out", "TimeoutError"));

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    await expect(service.validateDiscountCode("SAVE-ABC-1234")).rejects.toThrow("Dodo provider request timed out");
  });

  // Verifies assignment fails when requested user links would exceed the configured max uses.
  it("enforces maxUses guard during assignment", async () => {
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({ id: "d1", maxUses: 2 }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      }),
    };

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.assignDiscountToUsers("d1", ["u1", "u2"]);

    expect(result.success).toBe(false);
    expect((result as any).error).toContain("exceed maximum uses");
  });

  // Verifies remote provider deletion occurs before local discount deletion.
  it("deletes remote dodo discount before local deletion", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const dbDelete = vi.fn().mockReturnValue({ where: deleteWhere });

    const service = createDiscountsService({
      db: {
        query: {
          discounts: {
            findFirst: vi.fn().mockResolvedValue({ id: "d1", dodoDiscountId: "dd_1" }),
          },
        },
        delete: dbDelete,
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PAYMENTS_API_KEY: "key" },
    });

    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204, text: vi.fn().mockResolvedValue("") });

    const result = await service.deleteDiscount("d1");

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/discounts/dd_1"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(dbDelete).toHaveBeenCalled();
  });

  // Verifies short search terms are rejected early to avoid noisy lookups.
  it("searchUsersForDiscount requires at least 2 chars", async () => {
    const service = createDiscountsService({
      db: {} as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    await expect(service.searchUsersForDiscount("a")).resolves.toEqual([]);
  });

  // Verifies assignment deduplicates duplicate user ids before insert.
  it("deduplicates user ids during assignment", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({ id: "d1", maxUses: 5, currentUses: 0 }),
        },
        userDiscounts: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn(),
    };

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.assignDiscountToUsers("d1", ["u1", "u1", "u2", " u2 "]);

    expect(result).toEqual({ success: true, assignedCount: 2 });
    expect(insertValues).toHaveBeenCalledWith([
      { discountId: "d1", userId: "u1" },
      { discountId: "d1", userId: "u2" },
    ]);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
  });

  // Verifies removing assignments does not decrement actual redemption counters.
  it("does not mutate currentUses when removing discount assignments", async () => {
    const dbDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const dbDelete = vi.fn().mockReturnValue({ where: dbDeleteWhere });
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({ id: "d1", maxUses: 5, currentUses: 2 }),
        },
      },
      delete: dbDelete,
      update: vi.fn(),
    };

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.removeDiscountFromUsers("d1", ["u1", "u2"]);

    expect(result).toEqual({ success: true, removedCount: 2 });
    expect(dbDelete).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  // Verifies discount edits replace selected-user assignments in the same local transaction.
  it("replaces user assignments when updating a discount", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "d1", code: "SAVE-ABC-1234" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflictDoNothing });
    const tx = {
      update: vi.fn().mockReturnValue({ set: updateSet }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({
            id: "d1",
            code: "SAVE-ABC-1234",
            type: "percentage",
            value: "10",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-02-01"),
            maxUses: null,
            dodoDiscountId: "dd_1",
            status: "active",
          }),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    };

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.updateDiscount({
      id: "d1",
      userIds: ["u1", " u1 ", "u2"],
    });

    expect(result).toEqual({ success: true, discount: { id: "d1", code: "SAVE-ABC-1234" } });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith([
      { discountId: "d1", userId: "u1" },
      { discountId: "d1", userId: "u2" },
    ]);
    expect(insertOnConflictDoNothing).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  // Verifies assignment-only edits can clear all selected users without inserting rows.
  it("clears user assignments when updating a discount with an empty user list", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "d1", code: "SAVE-ABC-1234" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      update: vi.fn().mockReturnValue({ set: updateSet }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      insert: vi.fn(),
    };
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({
            id: "d1",
            code: "SAVE-ABC-1234",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-02-01"),
            dodoDiscountId: null,
          }),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    };

    const service = createDiscountsService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const result = await service.updateDiscount({
      id: "d1",
      userIds: [],
    });

    expect(result.success).toBe(true);
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  // Verifies code generation retries when a generated code already exists.
  it("generates unique codes and retries on collision", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "exists" })
      .mockResolvedValueOnce(null);

    const service = createDiscountsService({
      db: {
        query: {
          discounts: { findFirst },
        },
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    });

    const code = await service.generateDiscountCode("TEST");

    expect(code.startsWith("TEST-")).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
