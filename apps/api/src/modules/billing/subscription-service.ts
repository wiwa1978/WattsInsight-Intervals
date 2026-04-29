import { desc, eq, like, sql } from "drizzle-orm";

import { subscriptionEvents, type SubscriptionStatus, user, userSubscriptions } from "@platform/platform-db";

import { subscriptionPlans } from "../../config/billing";

type SubscriptionServiceDeps = {
  db: any;
};

const supportedStatuses = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "paused",
]);

export type UpsertUserSubscriptionInput = {
  userId: string;
  planKey: string;
  dodoCustomerId?: string | null;
  dodoSubscriptionId: string;
  status: SubscriptionStatus | "cancelled";
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
};

export type RecordSubscriptionEventInput = {
  userId?: string | null;
  dodoSubscriptionId?: string | null;
  eventType: string;
  status?: SubscriptionStatus | "cancelled" | null;
  payload?: unknown;
};

export function normalizeSubscriptionStatus(status: string): SubscriptionStatus {
  const normalized = status === "cancelled" ? "canceled" : status;

  if (supportedStatuses.has(normalized as SubscriptionStatus)) {
    return normalized as SubscriptionStatus;
  }

  if (status === "failed") {
    return "past_due";
  }

  if (status === "on_hold") {
    return "paused";
  }

  if (status === "pending") {
    return "trialing";
  }

  throw new Error(`Unsupported subscription status: ${status}`);
}

export function hasActiveSubscriptionStatus(status: SubscriptionStatus) {
  return status === "active" || status === "trialing";
}

export function calculateSubscriptionRecurringRevenue(subscriptions: Array<{ planKey: string; status: SubscriptionStatus }>) {
  const monthlyRecurringRevenueCents = subscriptions.reduce((total, subscription) => {
    if (!hasActiveSubscriptionStatus(subscription.status)) {
      return total;
    }

    const plan = subscriptionPlans.find((entry) => entry.key === subscription.planKey);
    return total + (plan?.price ?? 0);
  }, 0);
  const monthlyRecurringRevenue = monthlyRecurringRevenueCents / 100;

  return {
    monthlyRecurringRevenue,
    annualRecurringRevenue: monthlyRecurringRevenue * 12,
  };
}

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

function normalizeSearchEmail(searchEmail?: string) {
  const normalized = searchEmail?.trim();
  return normalized ? normalized.slice(0, 255) : undefined;
}

export function createSubscriptionService(deps: SubscriptionServiceDeps) {
  async function getUserSubscription(userId: string) {
    return deps.db.query.userSubscriptions.findFirst({
      where: eq(userSubscriptions.userId, userId),
      orderBy: desc(userSubscriptions.createdAt),
    });
  }

  async function upsertUserSubscription(input: UpsertUserSubscriptionInput) {
    const status = normalizeSubscriptionStatus(input.status);
    const values = {
      userId: input.userId,
      planKey: input.planKey,
      dodoCustomerId: input.dodoCustomerId ?? null,
      dodoSubscriptionId: input.dodoSubscriptionId,
      status,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      updatedAt: new Date(),
    };

    const [subscription] = await deps.db
      .insert(userSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: userSubscriptions.dodoSubscriptionId,
        set: values,
      })
      .returning();

    return subscription;
  }

  async function recordSubscriptionEvent(input: RecordSubscriptionEventInput) {
    await deps.db.insert(subscriptionEvents).values({
      userId: input.userId ?? null,
      dodoSubscriptionId: input.dodoSubscriptionId ?? null,
      eventType: input.eventType,
      status: input.status ? normalizeSubscriptionStatus(input.status) : null,
      payload: input.payload ?? null,
    });
  }

  async function listSubscriptions(limit = 20, offset = 0, searchEmail?: string) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedSearchEmail = normalizeSearchEmail(searchEmail);
    const whereCondition = normalizedSearchEmail ? like(user.email, `%${normalizedSearchEmail}%`) : undefined;

    const [subscriptions, totalCountResult] = await Promise.all([
      deps.db
        .select({
          id: userSubscriptions.id,
          userId: userSubscriptions.userId,
          planKey: userSubscriptions.planKey,
          dodoCustomerId: userSubscriptions.dodoCustomerId,
          dodoSubscriptionId: userSubscriptions.dodoSubscriptionId,
          status: userSubscriptions.status,
          currentPeriodStart: userSubscriptions.currentPeriodStart,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          createdAt: userSubscriptions.createdAt,
          updatedAt: userSubscriptions.updatedAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(whereCondition)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(whereCondition),
    ]);

    const total = totalCountResult[0]?.count ?? 0;
    return {
      subscriptions,
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function getSubscriptionStats() {
    const subscriptions = await deps.db
      .select({
        planKey: userSubscriptions.planKey,
        status: userSubscriptions.status,
      })
      .from(userSubscriptions);
    const recurringRevenue = calculateSubscriptionRecurringRevenue(subscriptions);

    return {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "active").length,
      trialingSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "trialing").length,
      pastDueSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "past_due").length,
      canceledSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "canceled").length,
      ...recurringRevenue,
    };
  }

  return {
    getUserSubscription,
    upsertUserSubscription,
    recordSubscriptionEvent,
    listSubscriptions,
    getSubscriptionStats,
  };
}
