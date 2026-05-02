import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";

import { subscriptionEvents, subscriptionPayments, type SubscriptionStatus, user, userSubscriptions } from "@platform/platform-db";

import { subscriptionPlans } from "../../config/billing";
import { isProviderTimeout, withProviderTimeout } from "../../lib/provider-fetch";
import { redactLogValue } from "../../observability/redaction";

type SubscriptionServiceDeps = {
  db: any;
  env?: {
    DODO_PAYMENTS_API_KEY?: string;
    DODO_PAYMENTS_ENVIRONMENT: "test_mode" | "live_mode";
  };
};

type SubscriptionPaymentStatus = "completed" | "pending" | "failed" | "refunded";

type RecordSubscriptionPaymentInput = {
  userId: string;
  planKey: string;
  paymentId: string;
  paymentStatus: SubscriptionPaymentStatus;
  dodoCustomerId?: string | null;
  dodoSubscriptionId?: string | null;
  pricing: {
    priceExclVat: number;
    priceInclVat: number;
    vatAmount: number;
    currency: string;
  };
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

  async function recordSubscriptionPayment(input: RecordSubscriptionPaymentInput) {
    const now = new Date();
    const paymentSnapshot = {
      provider: "dodo" as const,
      planKey: input.planKey,
      customerId: input.dodoCustomerId ?? undefined,
      subscriptionId: input.dodoSubscriptionId ?? undefined,
      priceExclVat: input.pricing.priceExclVat,
      priceInclVat: input.pricing.priceInclVat,
      vatAmount: input.pricing.vatAmount,
      currency: input.pricing.currency,
    };

    return deps.db.transaction(async (tx: any) => {
      const existing = await tx.query.subscriptionPayments.findFirst({
        where: eq(subscriptionPayments.paymentId, input.paymentId),
      });

      if (existing && existing.userId !== input.userId) {
        throw new Error(`Payment ${input.paymentId} is already associated with another user`);
      }

      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          userId: input.userId,
          planKey: input.planKey,
          dodoCustomerId: input.dodoCustomerId ?? null,
          dodoSubscriptionId: input.dodoSubscriptionId ?? null,
          paymentStatus: input.paymentStatus,
          priceExclVat: input.pricing.priceExclVat,
          priceInclVat: input.pricing.priceInclVat,
          vatAmount: input.pricing.vatAmount,
          currency: input.pricing.currency,
          paymentSnapshot,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [subscriptionPayments.paymentProvider, subscriptionPayments.paymentId],
          set: {
            paymentStatus: input.paymentStatus,
            dodoCustomerId: input.dodoCustomerId ?? existing?.dodoCustomerId ?? null,
            dodoSubscriptionId: input.dodoSubscriptionId ?? existing?.dodoSubscriptionId ?? null,
            priceExclVat: input.pricing.priceExclVat,
            priceInclVat: input.pricing.priceInclVat,
            vatAmount: input.pricing.vatAmount,
            currency: input.pricing.currency,
            paymentSnapshot,
            updatedAt: now,
          },
        })
        .returning();

      return payment;
    });
  }

  async function listUserSubscriptionPayments(userId: string, limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: subscriptionPayments.id,
        planKey: subscriptionPayments.planKey,
        dodoSubscriptionId: subscriptionPayments.dodoSubscriptionId,
        paymentStatus: subscriptionPayments.paymentStatus,
        paymentId: subscriptionPayments.paymentId,
        priceExclVat: subscriptionPayments.priceExclVat,
        priceInclVat: subscriptionPayments.priceInclVat,
        vatAmount: subscriptionPayments.vatAmount,
        currency: subscriptionPayments.currency,
        createdAt: subscriptionPayments.createdAt,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, userId))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(normalizedLimit);
  }

  async function downloadSubscriptionInvoice(userId: string, paymentId: string) {
    const [payment] = await deps.db
      .select({
        id: subscriptionPayments.id,
        userId: subscriptionPayments.userId,
        paymentStatus: subscriptionPayments.paymentStatus,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.paymentId, paymentId))
      .limit(1);

    if (!payment) {
      throw new Error("Subscription payment not found");
    }

    if (payment.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (payment.paymentStatus !== "completed") {
      throw new Error("Invoice not available for this payment");
    }

    const apiKey = deps.env?.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error("DodoPayments API key not configured");
    }

    const baseUrl =
      deps.env?.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
        ? "https://live.dodopayments.com"
        : "https://test.dodopayments.com";

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/invoices/payments/${paymentId}`,
        withProviderTimeout({
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }),
      );
    } catch (error) {
      throw new Error(isProviderTimeout(error) ? "Invoice provider request timed out" : "Invoice provider request failed");
    }

    if (!response.ok) {
      throw new Error("Invoice provider request failed");
    }

    const invoiceData = (await response.json()) as { invoice_pdf?: string; url?: string };
    if (!invoiceData.invoice_pdf && !invoiceData.url) {
      throw new Error("Invoice URL not available in API response");
    }

    return {
      success: true as const,
      invoiceUrl: invoiceData.invoice_pdf || invoiceData.url,
    };
  }

  async function getLatestDodoCustomerId(userId: string) {
    const [subscription] = await deps.db
      .select({ dodoCustomerId: userSubscriptions.dodoCustomerId })
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), isNotNull(userSubscriptions.dodoCustomerId)))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (subscription?.dodoCustomerId) {
      return subscription.dodoCustomerId;
    }

    const [payment] = await deps.db
      .select({ dodoCustomerId: subscriptionPayments.dodoCustomerId })
      .from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.userId, userId), isNotNull(subscriptionPayments.dodoCustomerId)))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(1);

    return payment?.dodoCustomerId ?? null;
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
      payload: redactLogValue(input.payload) ?? null,
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

  async function getPlanDistribution() {
    const rows = await deps.db
      .select({
        planKey: userSubscriptions.planKey,
        count: sql<number>`COUNT(*)`,
      })
      .from(userSubscriptions)
      .groupBy(userSubscriptions.planKey);

    return rows.map((row: { planKey: string; count: number | string | bigint }) => ({
      planKey: row.planKey,
      count: Number(row.count),
    }));
  }

  async function listSubscriptionEvents(limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: subscriptionEvents.id,
        userId: subscriptionEvents.userId,
        dodoSubscriptionId: subscriptionEvents.dodoSubscriptionId,
        eventType: subscriptionEvents.eventType,
        status: subscriptionEvents.status,
        createdAt: subscriptionEvents.createdAt,
      })
      .from(subscriptionEvents)
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(normalizedLimit);
  }

  return {
    getUserSubscription,
    recordSubscriptionPayment,
    listUserSubscriptionPayments,
    downloadSubscriptionInvoice,
    getLatestDodoCustomerId,
    upsertUserSubscription,
    recordSubscriptionEvent,
    listSubscriptions,
    getSubscriptionStats,
    getPlanDistribution,
    listSubscriptionEvents,
  };
}
