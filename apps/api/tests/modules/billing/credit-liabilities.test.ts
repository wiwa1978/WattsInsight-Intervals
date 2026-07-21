import { describe, expect, it, vi } from "vitest";

import { creditLiabilities } from "@platform/platform-db";

import { createCreditLiabilityService } from "../../../src/modules/billing/credit-liabilities";

function createInsertMock(rows: unknown[]) {
  const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) });
  return { insert: vi.fn().mockReturnValue({ values }), values };
}

describe("createCreditLiabilityService", () => {
  it("creates open liability for missing credits", async () => {
    const created = {
      id: "liability-1",
      userId: "user-1",
      amount: "42.00",
      remainingAmount: "42.00",
      reason: "refund",
      status: "open",
    };
    const insertMock = createInsertMock([created]);
    const service = createCreditLiabilityService({
      db: {
        insert: insertMock.insert,
      } as any,
    });

    const result = await service.create({
      userId: "user-1",
      amount: 42,
      reason: "refund",
      sourcePaymentId: "pay_1",
      sourceRefundId: "rfnd_1",
    });

    expect(result).toBe(created);
    expect(insertMock.insert).toHaveBeenCalledWith(creditLiabilities);
    expect(insertMock.values).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: "42.00",
      remainingAmount: "42.00",
      reason: "refund",
      status: "open",
      sourcePaymentId: "pay_1",
      sourceRefundId: "rfnd_1",
    }));
  });

  it("settles liability from future credit purchase before increasing usable balance", async () => {
    const liability = {
      id: "liability-1",
      userId: "user-1",
      amount: "100.00",
      remainingAmount: "70.00",
      reason: "refund",
      status: "open",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const db = {
      query: {
        creditLiabilities: {
          findMany: vi.fn().mockResolvedValueOnce([liability]),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };
    const service = createCreditLiabilityService({ db: db as any });

    const result = await service.applyIncomingCredits("user-1", 100);

    expect(result).toEqual({ usableCredits: 30, settledCredits: 70 });
    expect(db.query.creditLiabilities.findMany).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      remainingAmount: "0.00",
      status: "settled",
      settledAt: expect.any(Date),
    }));
  });

  it("waives liability and records waived status", async () => {
    const waived = {
      id: "liability-1",
      status: "waived",
      remainingAmount: "0.00",
      waivedAt: new Date("2026-01-02T00:00:00Z"),
      metadata: { waivedByAdminUserId: "admin-1" },
    };
    const returning = vi.fn().mockResolvedValue([waived]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    };
    const service = createCreditLiabilityService({ db: db as any });

    const result = await service.waive("liability-1", "admin-1");

    expect(result).toBe(waived);
    expect(db.update).toHaveBeenCalledWith(creditLiabilities);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "waived",
      remainingAmount: "0.00",
      waivedAt: expect.any(Date),
      metadata: expect.objectContaining({ waivedByAdminUserId: "admin-1" }),
    }));
  });
});
