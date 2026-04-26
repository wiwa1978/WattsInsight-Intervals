import { describe, expect, it, vi } from "vitest";

import { creditTransactions, userCredits, voucherRedemptions, vouchers } from "@platform/platform-db";

import { createVouchersService } from "../../../src/modules/vouchers/service";

describe("createVouchersService", () => {
  // Verifies updates cannot create an impossible redeemed-count state.
  it("rejects maxRedemptions below currentRedemptions", async () => {
    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "11111111-1111-4111-8111-111111111111",
            code: "WELCOME",
            creditAmount: 10,
            status: "active",
            currentRedemptions: 3,
            maxRedemptions: 5,
            appliesToAllUsers: true,
            expiresAt: null,
            assignments: [],
          }),
        },
      },
      transaction: vi.fn(),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.updateVoucher({
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 2,
    });

    expect(result).toEqual({ success: false, error: "Max redemptions cannot be lower than current redemptions" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // Verifies equal limits are allowed so admins can cap future redemptions at current usage.
  it("allows maxRedemptions equal to currentRedemptions", async () => {
    const updatedVoucher = { id: "11111111-1111-4111-8111-111111111111", maxRedemptions: 3 };
    const returning = vi.fn().mockResolvedValue([updatedVoucher]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "11111111-1111-4111-8111-111111111111",
            code: "WELCOME",
            creditAmount: 10,
            status: "active",
            currentRedemptions: 3,
            maxRedemptions: 5,
            appliesToAllUsers: true,
            expiresAt: null,
            assignments: [],
          }),
        },
      },
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ update })),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.updateVoucher({
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 3,
    });

    expect(result).toEqual({ success: true, voucher: updatedVoucher });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ maxRedemptions: 3, status: "redeemed" }));
  });

  // Verifies committed redemptions are not reported as failed when only notification delivery fails.
  it("treats post-redemption notification failures as non-fatal", async () => {
    const voucher = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 0,
      maxRedemptions: 2,
      appliesToAllUsers: true,
      expiresAt: null,
      redeemedAt: null,
    };
    const execute = vi.fn().mockResolvedValue([voucher]);
    const findCredits = vi.fn().mockResolvedValueOnce({
      userId: "33333333-3333-4333-8333-333333333333",
      balance: "5",
      totalPurchased: "0",
      totalSpent: "0",
    });
    const insert = vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn(() => {
        if (table === voucherRedemptions) {
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: "redemption-1" }]),
            })),
          };
        }

        return Promise.resolve(undefined);
      }),
    }));
    const update = vi.fn().mockImplementation((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    const tx = {
      execute,
      query: {
        userCredits: { findFirst: findCredits },
      },
      insert,
      update,
    };
    const createNotification = vi.fn().mockRejectedValue(new Error("notification unavailable"));
    const db = {
      transaction: vi.fn(async (cb: (trx: unknown) => unknown) => cb(tx)),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification },
    });

    const result = await service.redeemVoucher("33333333-3333-4333-8333-333333333333", "welcome");

    expect(result).toEqual({ success: true, creditsAdded: 10, newBalance: 15 });
    expect(createNotification).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(voucherRedemptions);
    expect(insert).toHaveBeenCalledWith(creditTransactions);
    expect(update).toHaveBeenCalledWith(userCredits);
    expect(update).toHaveBeenCalledWith(vouchers);
  });
});
