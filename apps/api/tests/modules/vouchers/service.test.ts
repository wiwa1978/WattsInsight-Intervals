import { describe, expect, it, vi } from "vitest";

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
});
