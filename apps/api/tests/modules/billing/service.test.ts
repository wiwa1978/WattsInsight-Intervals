import { afterEach, describe, expect, it, vi } from "vitest";

import {
  creditPurchases,
  creditTransactions,
  user,
  userCredits,
} from "@platform/platform-db";

import { createBillingService } from "../../../src/modules/billing/service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createBillingService", () => {
  // Verifies credit rows are lazily initialized for users without a prior balance record.
  it("initializes user credits when missing", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null);
    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ userId: "u1", balance: "0", totalPurchased: "0", totalSpent: "0" }]),
      }),
    });

    const service = createBillingService({
      db: {
        query: { userCredits: { findFirst } },
        insert: vi.fn().mockImplementation((table: unknown) => {
          if (table !== userCredits) {
            throw new Error("unexpected table insert");
          }
          return { values: insertValues };
        }),
      },
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    } as any);

    const result = await service.getCreditBalance("u1");

    expect(findFirst).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith({
      userId: "u1",
      balance: "0",
      totalPurchased: "0",
      totalSpent: "0",
    });
    expect(result).toMatchObject({ userId: "u1", balance: "0" });
  });

  // Verifies concurrent initializers do not fail when another request wins the unique-key race.
  it("returns the existing credits row when insert conflicts", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u1", balance: "0", totalPurchased: "0", totalSpent: "0" });

    const onConflictDoNothing = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    });

    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing,
    });

    const service = createBillingService({
      db: {
        query: { userCredits: { findFirst } },
        insert: vi.fn().mockImplementation((table: unknown) => {
          if (table !== userCredits) {
            throw new Error("unexpected table insert");
          }
          return { values: insertValues };
        }),
      },
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    } as any);

    const result = await service.getCreditBalance("u1");

    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: userCredits.userId });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ userId: "u1", balance: "0" });
  });

  // Verifies successful purchases atomically update purchases, balances, ledger entries, and notifications.
  it("processes completed purchase and writes ledger + notification", async () => {
    const notifications = { createNotification: vi.fn().mockResolvedValue(undefined) };
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "100", totalPurchased: "100", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditPurchases) {
            return {
              returning: vi.fn().mockResolvedValue([
                {
                  id: "purchase-1",
                  userId: "u1",
                  packageKey: "silver",
                  paymentStatus: "completed",
                },
              ]),
            };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: vi.fn((set: unknown) => {
          updates.push({ table, set });
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const db = {
      transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
    };

    const service = createBillingService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const purchase = await service.processCreditPurchase("u1", "silver", "pay_1", "completed");

    expect(purchase).toMatchObject({ id: "purchase-1", paymentStatus: "completed" });
    expect(inserts[0]?.values).toMatchObject({ paymentStatus: "completed" });
    expect((inserts[0]?.values as { creditsGrantedAt?: unknown }).creditsGrantedAt).toBeInstanceOf(Date);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(userCredits);
    expect(notifications.createNotification).toHaveBeenCalledOnce();

    const transactionInserts = inserts.filter((entry) => entry.table === creditTransactions);
    expect(transactionInserts).toHaveLength(2);
    expect(transactionInserts[0]?.values).toMatchObject({ type: "purchase", userId: "u1", referenceId: "pay_1" });
    expect(transactionInserts[1]?.values).toMatchObject({ type: "bonus", userId: "u1", referenceId: "pay_1" });
  });

  // Verifies pending purchases do not mutate balances or produce side effects.
  it("does not mutate credits for pending purchases", async () => {
    const purchaseValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "purchase-pending", paymentStatus: "pending" }]),
    });

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: table === creditPurchases ? purchaseValues : vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const purchase = await service.processCreditPurchase("u1", "silver", "pay_2", "pending");

    expect(purchase).toMatchObject({ id: "purchase-pending", paymentStatus: "pending" });
    expect(purchaseValues).toHaveBeenCalledWith(expect.objectContaining({ creditsGrantedAt: null }));
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies repeated payment events with the same paymentId are safely deduplicated.
  it("is idempotent for same paymentId and does not double-credit", async () => {
    const alreadyGrantedAt = new Date("2026-01-01T00:00:00Z");
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "existing-purchase",
            userId: "u1",
            paymentId: "pay_dup",
            paymentStatus: "completed",
            creditsGrantedAt: alreadyGrantedAt,
          }),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };
    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "silver", "pay_dup", "completed");

    expect(result).toMatchObject({ id: "existing-purchase", paymentId: "pay_dup", creditsGrantedAt: alreadyGrantedAt });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies later failed events cannot downgrade a purchase that already granted credits.
  it("does not mark credited completed purchases as failed", async () => {
    const alreadyGrantedAt = new Date("2026-01-01T00:00:00Z");
    const existingPurchase = {
      id: "existing-completed",
      userId: "u1",
      paymentId: "pay_completed",
      paymentStatus: "completed",
      creditsGrantedAt: alreadyGrantedAt,
    };
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(existingPurchase),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };
    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "silver", "pay_completed", "failed");

    expect(result).toBe(existingPurchase);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies a pending purchase receives credits on its first completed transition only.
  it("grants credits once when an existing pending purchase completes", async () => {
    const notifications = { createNotification: vi.fn().mockResolvedValue(undefined) };
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "existing-pending",
            userId: "u1",
            paymentId: "pay_pending",
            paymentStatus: "pending",
            dodoCustomerId: null,
            creditsGrantedAt: null,
          }),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "10", totalPurchased: "20", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          return Promise.resolve(undefined);
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: vi.fn((set: unknown) => {
          updates.push({ table, set });
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "silver", "pay_pending", "completed");

    expect(result).toMatchObject({ id: "existing-pending", paymentStatus: "completed" });
    expect(result.creditsGrantedAt).toBeInstanceOf(Date);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.table).toBe(creditPurchases);
    expect(updates[0]?.set).toMatchObject({ paymentStatus: "completed" });
    expect((updates[0]?.set as { creditsGrantedAt?: unknown }).creditsGrantedAt).toBeInstanceOf(Date);
    expect(updates[1]?.table).toBe(userCredits);

    const transactionInserts = inserts.filter((entry) => entry.table === creditTransactions);
    expect(transactionInserts).toHaveLength(2);
    expect(notifications.createNotification).toHaveBeenCalledOnce();
  });

  // Verifies full refunds reverse granted credits once and mark the purchase refunded.
  it("reverses credits once for refunded completed purchases", async () => {
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "purchase-refund",
            userId: "u1",
            packageKey: "silver",
            paymentId: "pay_refund",
            paymentStatus: "completed",
            credits: 100,
            bonusCredits: 10,
            creditsGrantedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "150", totalPurchased: "100", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          return Promise.resolve(undefined);
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: vi.fn((set: unknown) => {
          updates.push({ table, set });
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.processCreditRefund("pay_refund", "rfnd_123");

    expect(result).toMatchObject({ id: "purchase-refund", paymentStatus: "refunded" });
    expect(updates).toHaveLength(2);
    expect(updates[0]?.table).toBe(userCredits);
    expect(updates[0]?.set).toMatchObject({ balance: "40" });
    expect(updates[1]?.table).toBe(creditPurchases);
    expect(updates[1]?.set).toMatchObject({ paymentStatus: "refunded" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(creditTransactions);
    expect(inserts[0]?.values).toMatchObject({
      userId: "u1",
      type: "refund",
      amount: "-110",
      referenceType: "payment",
      referenceId: "pay_refund",
      balanceAfter: "40",
      metadata: { refundId: "rfnd_123" },
    });
  });

  // Verifies repeated refund events do not create duplicate reversal transactions.
  it("is idempotent for already refunded purchases", async () => {
    const existingPurchase = {
      id: "purchase-refunded",
      userId: "u1",
      packageKey: "silver",
      paymentId: "pay_refunded",
      paymentStatus: "refunded",
      credits: 100,
      bonusCredits: 10,
      creditsGrantedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(existingPurchase),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.processCreditRefund("pay_refunded", "rfnd_123");

    expect(result).toBe(existingPurchase);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
  });

  // Verifies invalid package keys fail fast before any persistence call.
  it("throws for unknown package key", async () => {
    const service = createBillingService({
      db: { transaction: vi.fn() } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.processCreditPurchase("u1", "invalid", "pay_3", "completed")).rejects.toThrow(
      "Credit package not found: invalid",
    );
  });

  // Verifies email lookup returns the first matching user identity.
  it("returns first matched user by email", async () => {
    const rows = [{ id: "u1" }];
    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.getUserByEmail("john@example.com");
    expect(result).toEqual({ id: "u1" });
  });

  // Verifies invoice download succeeds when ownership and payment state are valid.
  it("downloads invoice successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ invoice_pdf: "https://invoices.test/file.pdf" }),
      }),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      env: {
        DODO_PAYMENTS_API_KEY: "api-key",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.downloadInvoice("u1", "pay_1");
    expect(result.success).toBe(true);
    expect(result.invoiceUrl).toBe("https://invoices.test/file.pdf");
    expect(result).not.toHaveProperty("invoiceData");
    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch as any).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // Verifies provider failures are sanitized before surfacing to callers.
  it("sanitizes invoice provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("provider exploded"),
      }),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      env: {
        DODO_PAYMENTS_API_KEY: "api-key",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Invoice provider request failed");
  });

  // Verifies provider timeout details are sanitized before surfacing to callers.
  it("sanitizes invoice provider timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation timed out", "TimeoutError")),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      env: {
        DODO_PAYMENTS_API_KEY: "api-key",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Invoice provider request timed out");
  });

  // Verifies invoice download is blocked for non-owner users.
  it("rejects invoice download for wrong owner", async () => {
    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "someone-else",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      env: {
        DODO_PAYMENTS_API_KEY: "api-key",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Unauthorized");
  });

  // Verifies credit history and purchase queries respect explicit limits.
  it("returns credit history and purchases with limit", async () => {
    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "t1" }]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "p1" }]),
            }),
          }),
        }),
      });

    const service = createBillingService({
      db: { select } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const [history, purchases] = await Promise.all([
      service.getCreditHistory("u1", 5),
      service.getCreditPurchases("u1", 5),
    ]);

    expect(history).toEqual([{ id: "t1" }]);
    expect(purchases).toEqual([{ id: "p1" }]);
  });

  // Verifies credit history limits are clamped to a safe upper bound.
  it("clamps oversized history and purchase limits", async () => {
    const historyLimit = vi.fn().mockResolvedValue([]);
    const purchaseLimit = vi.fn().mockResolvedValue([]);

    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: historyLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: purchaseLimit,
            }),
          }),
        }),
      });

    const service = createBillingService({
      db: { select } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await Promise.all([
      service.getCreditHistory("u1", 999),
      service.getCreditPurchases("u1", Number.NaN),
    ]);

    expect(historyLimit).toHaveBeenCalledWith(100);
    expect(purchaseLimit).toHaveBeenCalledWith(50);
  });
});
