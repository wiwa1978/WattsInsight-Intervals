import { and, asc, eq } from "drizzle-orm";

import { creditLiabilities, type CreditLiabilityReason } from "@platform/platform-db";

type Db = any;

type CreateCreditLiabilityInput = {
  userId: string;
  amount: number;
  reason: CreditLiabilityReason;
  sourcePaymentId?: string | null;
  sourceRefundId?: string | null;
  sourceDisputeId?: string | null;
  metadata?: unknown;
};

function toMoney(amount: number) {
  return amount.toFixed(2);
}

function normalizeAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Credit liability amount must be positive");
  }

  return Number(amount.toFixed(2));
}

export function createCreditLiabilityService(deps: { db: Db }) {
  async function create(input: CreateCreditLiabilityInput) {
    const amount = normalizeAmount(input.amount);
    const [liability] = await deps.db.insert(creditLiabilities).values({
      userId: input.userId,
      amount: toMoney(amount),
      remainingAmount: toMoney(amount),
      reason: input.reason,
      status: "open",
      sourcePaymentId: input.sourcePaymentId ?? null,
      sourceRefundId: input.sourceRefundId ?? null,
      sourceDisputeId: input.sourceDisputeId ?? null,
      metadata: input.metadata,
    }).returning();

    return liability;
  }

  async function listOpenForUser(userId: string) {
    return deps.db.query.creditLiabilities.findMany({
      where: (table: any, operators: any) => operators.and(
        operators.eq(table.userId, userId),
        operators.eq(table.status, "open"),
      ),
      orderBy: (table: any, operators: any) => [operators.asc(table.createdAt)],
    });
  }

  async function applyIncomingCredits(userId: string, credits: number) {
    let remainingCredits = Math.max(0, Number(credits.toFixed(2)));
    let settledCredits = 0;

    if (remainingCredits <= 0) {
      return { usableCredits: 0, settledCredits: 0 };
    }

    const liabilities = deps.db.query?.creditLiabilities?.findMany
      ? await listOpenForUser(userId)
      : await deps.db
        .select()
        .from(creditLiabilities)
        .where(and(eq(creditLiabilities.userId, userId), eq(creditLiabilities.status, "open")))
        .orderBy(asc(creditLiabilities.createdAt));

    for (const liability of liabilities) {
      if (remainingCredits <= 0) break;

      const liabilityRemaining = Number(liability.remainingAmount);
      if (liabilityRemaining <= 0) continue;

      const applied = Math.min(remainingCredits, liabilityRemaining);
      const nextRemaining = Number((liabilityRemaining - applied).toFixed(2));
      remainingCredits = Number((remainingCredits - applied).toFixed(2));
      settledCredits = Number((settledCredits + applied).toFixed(2));
      const now = new Date();

      await deps.db.update(creditLiabilities).set({
        remainingAmount: toMoney(nextRemaining),
        status: nextRemaining === 0 ? "settled" : "open",
        updatedAt: now,
        settledAt: nextRemaining === 0 ? now : null,
      }).where(eq(creditLiabilities.id, liability.id));
    }

    return { usableCredits: remainingCredits, settledCredits };
  }

  async function waive(id: string, adminUserId: string) {
    const now = new Date();
    const [liability] = await deps.db.update(creditLiabilities).set({
      status: "waived",
      remainingAmount: "0.00",
      metadata: { waivedByAdminUserId: adminUserId, waivedAt: now.toISOString() },
      updatedAt: now,
      waivedAt: now,
    }).where(eq(creditLiabilities.id, id)).returning();

    return liability;
  }

  return { create, listOpenForUser, applyIncomingCredits, waive };
}
