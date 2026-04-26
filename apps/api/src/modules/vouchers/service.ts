import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  creditTransactions,
  user,
  userCredits,
  voucherAssignments,
  voucherRedemptions,
  vouchers,
} from "@platform/platform-db";
import type {
  CreateVoucherInput,
  RedeemVoucherInput,
  UpdateVoucherInput,
  VoucherStatus,
} from "@platform/contracts";

import { billingConfig } from "../../config/billing";

type VoucherRecord = typeof vouchers.$inferSelect;
type VoucherQueryRecord = VoucherRecord & {
  assignments: Array<{
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  redemptions: Array<{
    id: string;
    voucherId: string;
    userId: string;
    creditsGranted: number;
    redeemedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type VouchersServiceDeps = {
  db: any;
  notifications: {
    createNotification: (input: {
      userId: string;
      title: string;
      message: string;
      type?: "info" | "warning" | "success" | "error";
      category: string;
      data?: Record<string, unknown>;
      showAsBanner?: boolean;
      bannerExpiresAt?: Date;
    }) => Promise<unknown>;
  };
};

type DbTransaction = any;

function getVoucherFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function voucherFailure(error: string) {
  return { success: false as const, error };
}

function voucherSuccess<T extends Record<string, unknown>>(payload: T) {
  return { success: true as const, ...payload };
}

function getVoucherListStatusFilter(status?: string) {
  if (!status || status === "all") {
    return undefined;
  }

  return eq(vouchers.status, status as VoucherStatus);
}

function getVoucherSearchPattern(search: string) {
  return `%${search.trim()}%`;
}

function getUniqueVoucherUserIds(userIds?: string[]) {
  return Array.from(new Set((userIds ?? []).filter(Boolean)));
}

function getVoucherAssignmentState(
  assignmentScope: "selected" | "all",
  userIds?: string[],
  maxRedemptions?: number,
) {
  const normalizedUserIds = getUniqueVoucherUserIds(userIds);
  const appliesToAllUsers = assignmentScope === "all";
  const nextMaxRedemptions = appliesToAllUsers
    ? maxRedemptions ?? 1
    : normalizedUserIds.length;

  return {
    appliesToAllUsers,
    userIds: appliesToAllUsers ? [] : normalizedUserIds,
    maxRedemptions: nextMaxRedemptions,
  };
}

function inferVoucherStatus(input: {
  status: VoucherStatus;
  currentRedemptions: number;
  maxRedemptions: number;
  expiresAt: Date | null;
}): VoucherStatus {
  if (input.status === "inactive") {
    return "inactive";
  }

  const now = new Date();

  if (input.expiresAt && input.expiresAt < now) {
    return "expired";
  }

  if (input.currentRedemptions >= input.maxRedemptions) {
    return "redeemed";
  }

  return "active";
}

async function getOrInitializeCredits(
  userId: string,
  tx: VouchersServiceDeps["db"] | DbTransaction,
) {
  let credits = await tx.query.userCredits.findFirst({ where: eq(userCredits.userId, userId) });

  if (!credits) {
    const [created] = await tx
      .insert(userCredits)
      .values({
        userId,
        balance: "0",
        totalPurchased: "0",
        totalSpent: "0",
      })
      .returning();
    credits = created;
  }

  return credits;
}

async function replaceVoucherAssignments(tx: DbTransaction, voucherId: string, userIds: string[]) {
  await tx.delete(voucherAssignments).where(eq(voucherAssignments.voucherId, voucherId));

  if (userIds.length === 0) {
    return;
  }

  await tx.insert(voucherAssignments).values(
    userIds.map((userId) => ({
      voucherId,
      userId,
    })),
  );
}

function mapVoucherWithRelations(voucher: VoucherQueryRecord) {
  const { assignments, ...rest } = voucher;

  return {
    ...rest,
    assignedUsers: assignments.map((assignment) => assignment.user),
  };
}

function getRedeemableVoucherStatus(voucher: VoucherRecord) {
  return inferVoucherStatus({
    status: voucher.status,
    currentRedemptions: voucher.currentRedemptions,
    maxRedemptions: voucher.maxRedemptions,
    expiresAt: voucher.expiresAt,
  });
}

async function lockVoucherByCode(tx: DbTransaction, code: string) {
  const lockedVoucherRows = await tx.execute(sql`
    SELECT *
    FROM vouchers
    WHERE code = ${code}
    FOR UPDATE
  `);

  return lockedVoucherRows[0] as VoucherRecord | undefined;
}

async function assertVoucherCanBeRedeemed(tx: DbTransaction, voucher: VoucherRecord, userId: string) {
  if (getRedeemableVoucherStatus(voucher) !== "active") {
    throw new Error("Voucher is not redeemable");
  }

  if (voucher.appliesToAllUsers) {
    return;
  }

  const assignment = await tx.query.voucherAssignments.findFirst({
    where: and(eq(voucherAssignments.voucherId, voucher.id), eq(voucherAssignments.userId, userId)),
  });

  if (!assignment) {
    throw new Error("Voucher is not assigned to your account");
  }
}

async function addVoucherCredits(tx: DbTransaction, userId: string, voucher: VoucherRecord) {
  const credits = await getOrInitializeCredits(userId, tx);
  const newBalance = parseFloat(credits.balance) + voucher.creditAmount;

  if (newBalance > billingConfig.maxCredits) {
    throw new Error(`Cannot exceed maximum credits limit of ${billingConfig.maxCredits}`);
  }

  await tx
    .update(userCredits)
    .set({
      balance: newBalance.toString(),
      updatedAt: new Date(),
    })
    .where(eq(userCredits.userId, userId));

  await tx.insert(creditTransactions).values({
    userId,
    type: "voucher",
    amount: voucher.creditAmount.toString(),
    description: `Voucher redeemed: ${voucher.code}`,
    referenceType: "voucher",
    referenceId: voucher.id,
    balanceAfter: newBalance.toString(),
    metadata: { code: voucher.code },
  });

  return newBalance;
}

async function reserveVoucherRedemption(tx: DbTransaction, userId: string, voucher: VoucherRecord) {
  const insertedRedemptions = await tx
    .insert(voucherRedemptions)
    .values({
      voucherId: voucher.id,
      userId,
      creditsGranted: voucher.creditAmount,
    })
    .onConflictDoNothing()
    .returning({ id: voucherRedemptions.id });

  if (insertedRedemptions.length === 0) {
    throw new Error("Voucher has already been redeemed by this user");
  }
}

async function updateVoucherRedemptionState(tx: DbTransaction, voucher: VoucherRecord) {
  const nextRedemptions = voucher.currentRedemptions + 1;
  const nextStatus = inferVoucherStatus({
    status: voucher.status,
    currentRedemptions: nextRedemptions,
    maxRedemptions: voucher.maxRedemptions,
    expiresAt: voucher.expiresAt,
  });

  await tx
    .update(vouchers)
    .set({
      currentRedemptions: nextRedemptions,
      redeemedAt: nextStatus === "redeemed" ? new Date() : voucher.redeemedAt,
      status: nextStatus,
    })
    .where(eq(vouchers.id, voucher.id));
}

async function redeemVoucherTransaction(tx: DbTransaction, userId: string, normalizedCode: string) {
  const voucher = await lockVoucherByCode(tx, normalizedCode);

  if (!voucher) {
    throw new Error("Voucher not found");
  }

  await assertVoucherCanBeRedeemed(tx, voucher, userId);

  await reserveVoucherRedemption(tx, userId, voucher);
  const newBalance = await addVoucherCredits(tx, userId, voucher);
  await updateVoucherRedemptionState(tx, voucher);

  return { voucher, newBalance };
}

export function createVouchersService(deps: VouchersServiceDeps) {
  function normalizeLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(20, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  function normalizeOffset(offset: number) {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.max(Math.trunc(offset), 0);
  }

  async function createVoucher(input: CreateVoucherInput) {
    const code = input.code.toUpperCase();
    const existing = await deps.db.query.vouchers.findFirst({
      where: eq(vouchers.code, code),
    });

    if (existing) {
      return voucherFailure("Voucher code already exists");
    }

    const assignmentState = getVoucherAssignmentState(
      input.assignmentScope,
      input.userIds,
      input.maxRedemptions,
    );

    const voucher = await deps.db.transaction(async (tx: DbTransaction) => {
      const [createdVoucher] = await tx
        .insert(vouchers)
        .values({
          code,
          creditAmount: input.creditAmount,
          maxRedemptions: assignmentState.maxRedemptions,
          appliesToAllUsers: assignmentState.appliesToAllUsers,
          expiresAt: input.expiresAt ?? null,
          status: inferVoucherStatus({
            status: "active",
            currentRedemptions: 0,
            maxRedemptions: assignmentState.maxRedemptions,
            expiresAt: input.expiresAt ?? null,
          }),
        })
        .returning();

      await replaceVoucherAssignments(tx, createdVoucher.id, assignmentState.userIds);
      return createdVoucher;
    });

    return voucherSuccess({ voucher });
  }

  async function updateVoucher(input: UpdateVoucherInput & { id: string }) {
    const existing = await deps.db.query.vouchers.findFirst({
      where: eq(vouchers.id, input.id),
      with: {
        assignments: {
          columns: {
            userId: true,
          },
        },
      },
    });

    if (!existing) {
      return voucherFailure("Voucher not found");
    }

    const code = input.code?.toUpperCase();
    if (code) {
      const duplicate = await deps.db.query.vouchers.findFirst({
        where: and(eq(vouchers.code, code), sql`${vouchers.id} != ${input.id}`),
      });

      if (duplicate) {
        return voucherFailure("Voucher code already exists");
      }
    }

    const nextAssignmentScope = input.assignmentScope ?? (existing.appliesToAllUsers ? "all" : "selected");
    const existingUserIds = existing.assignments.map((assignment: { userId: string }) => assignment.userId);
    const assignmentState = getVoucherAssignmentState(
      nextAssignmentScope,
      input.userIds ?? existingUserIds,
      input.maxRedemptions ?? existing.maxRedemptions,
    );
    const nextMaxRedemptions = assignmentState.maxRedemptions;
    if (nextMaxRedemptions < existing.currentRedemptions) {
      return voucherFailure("Max redemptions cannot be lower than current redemptions");
    }

    const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : input.expiresAt;
    const nextStatus = inferVoucherStatus({
      status: input.status ?? existing.status,
      currentRedemptions: existing.currentRedemptions,
      maxRedemptions: nextMaxRedemptions,
      expiresAt: nextExpiresAt,
    });

    const voucher = await deps.db.transaction(async (tx: DbTransaction) => {
      const [updatedVoucher] = await tx
        .update(vouchers)
        .set({
          code: code ?? existing.code,
          creditAmount: input.creditAmount ?? existing.creditAmount,
          maxRedemptions: nextMaxRedemptions,
          appliesToAllUsers: assignmentState.appliesToAllUsers,
          expiresAt: nextExpiresAt,
          status: nextStatus,
        })
        .where(eq(vouchers.id, input.id))
        .returning();

      if (input.assignmentScope !== undefined || input.userIds !== undefined) {
        await replaceVoucherAssignments(tx, input.id, assignmentState.userIds);
      }

      return updatedVoucher;
    });

    return voucherSuccess({ voucher });
  }

  async function getVouchers(limit = 20, offset = 0, search?: string, status?: string) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const statusFilter = getVoucherListStatusFilter(status);

    if (search) {
      const searchPattern = getVoucherSearchPattern(search);
      const matchingVoucherIds = await deps.db
        .selectDistinct({ id: vouchers.id })
        .from(vouchers)
        .leftJoin(voucherAssignments, eq(vouchers.id, voucherAssignments.voucherId))
        .leftJoin(user, eq(voucherAssignments.userId, user.id))
        .where(
          and(
            statusFilter,
            or(ilike(vouchers.code, searchPattern), ilike(user.email, searchPattern)),
          ),
        )
        .orderBy(desc(vouchers.createdAt));

      if (matchingVoucherIds.length === 0) {
        return {
          vouchers: [],
          total: 0,
          hasMore: false,
        };
      }

      const vouchersList = await deps.db.query.vouchers.findMany({
        where: or(...matchingVoucherIds.map((voucherRow: { id: string }) => eq(vouchers.id, voucherRow.id))),
        orderBy: desc(vouchers.createdAt),
        limit: normalizedLimit,
        offset: normalizedOffset,
        with: {
          assignments: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          redemptions: true,
        },
      });

      return {
        vouchers: vouchersList.map((voucher: unknown) => mapVoucherWithRelations(voucher as VoucherQueryRecord)),
        total: matchingVoucherIds.length,
        hasMore: normalizedOffset + normalizedLimit < matchingVoucherIds.length,
      };
    }

    const vouchersList = await deps.db.query.vouchers.findMany({
      where: statusFilter,
      orderBy: desc(vouchers.createdAt),
      limit: normalizedLimit,
      offset: normalizedOffset,
      with: {
        assignments: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        redemptions: true,
      },
    });

    const [{ count }] = await deps.db.select({ count: sql<number>`COUNT(*)` }).from(vouchers).where(statusFilter);

    return {
      vouchers: vouchersList.map((voucher: unknown) => mapVoucherWithRelations(voucher as VoucherQueryRecord)),
      total: count ?? 0,
      hasMore: normalizedOffset + normalizedLimit < (count ?? 0),
    };
  }

  async function getVoucherById(voucherId: string) {
    const voucher = await deps.db.query.vouchers.findFirst({
      where: eq(vouchers.id, voucherId),
      with: {
        assignments: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        redemptions: true,
      },
    });

    if (!voucher) {
      return voucherFailure("Voucher not found");
    }

    return voucherSuccess({ voucher: mapVoucherWithRelations(voucher as VoucherQueryRecord) });
  }

  async function searchUsers(query: string, limit = 20) {
    const normalizedQuery = query.trim();
    const normalizedLimit = normalizeLimit(limit, 50);

    if (normalizedQuery.length < 2) {
      return [];
    }

    return deps.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(or(ilike(user.name, `%${normalizedQuery}%`), ilike(user.email, `%${normalizedQuery}%`)))
      .limit(normalizedLimit);
  }

  async function redeemVoucher(userId: string, codeInput: RedeemVoucherInput["code"]) {
    try {
      const normalizedCode = codeInput.trim().toUpperCase();
      const result = await deps.db.transaction((tx: DbTransaction) =>
        redeemVoucherTransaction(tx, userId, normalizedCode),
      );

      try {
        await deps.notifications.createNotification({
          userId,
          title: "voucherRedeemed.title",
          message: "voucherRedeemed.message",
          type: "success",
          category: "billing",
          data: {
            code: result.voucher.code,
            credits: result.voucher.creditAmount,
          },
        });
      } catch {
        // Redemption is already committed; notification delivery is best-effort until an outbox exists.
      }

      return voucherSuccess({
        creditsAdded: result.voucher.creditAmount,
        newBalance: result.newBalance,
      });
    } catch (error) {
      return voucherFailure(getVoucherFailureMessage(error, "Failed to redeem voucher"));
    }
  }

  return {
    createVoucher,
    updateVoucher,
    getVouchers,
    getVoucherById,
    searchUsers,
    redeemVoucher,
  };
}
