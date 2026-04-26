import { desc, eq } from "drizzle-orm";

import {
  creditPurchases,
  creditTransactions,
  user,
  userCredits,
} from "@platform/platform-db";

import { creditPackages } from "../../config/billing";
import { isProviderTimeout, withProviderTimeout } from "../../lib/provider-fetch";

type BillingServiceDeps = {
  db: any;
  env: {
    DODO_PAYMENTS_API_KEY?: string;
    DODO_PAYMENTS_ENVIRONMENT: "test_mode" | "live_mode";
  };
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

type PaymentStatus = "completed" | "pending" | "failed" | "refunded";

async function getOrInitializeCredits(db: any, userId: string) {
  const existing = await db.query.userCredits.findFirst({
    where: (table: any, operators: any) => operators.eq(table.userId, userId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(userCredits)
    .values({
      userId,
      balance: "0",
      totalPurchased: "0",
      totalSpent: "0",
    })
    .onConflictDoNothing({ target: userCredits.userId })
    .returning();

  if (created) {
    return created;
  }

  return db.query.userCredits.findFirst({
    where: (table: any, operators: any) => operators.eq(table.userId, userId),
  });
}

export function createBillingService(deps: BillingServiceDeps) {
  function clampLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(50, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  async function getCreditBalance(userId: string) {
    return getOrInitializeCredits(deps.db, userId);
  }

  async function getCreditHistory(userId: string, limit = 50) {
    const normalizedLimit = clampLimit(limit);

    return deps.db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(normalizedLimit);
  }

  async function getCreditPurchases(userId: string, limit = 50) {
    const normalizedLimit = clampLimit(limit);

    return deps.db
      .select({
        id: creditPurchases.id,
        packageKey: creditPurchases.packageKey,
        credits: creditPurchases.credits,
        bonusCredits: creditPurchases.bonusCredits,
        priceExclVat: creditPurchases.priceExclVat,
        priceInclVat: creditPurchases.priceInclVat,
        paymentStatus: creditPurchases.paymentStatus,
        paymentId: creditPurchases.paymentId,
        createdAt: creditPurchases.createdAt,
      })
      .from(creditPurchases)
      .where(eq(creditPurchases.userId, userId))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(normalizedLimit);
  }

  async function processCreditPurchase(
    userId: string,
    packageKey: string,
    paymentId: string,
    paymentStatus: PaymentStatus,
    dodoCustomerId?: string,
    pricingData?: {
      priceExclVat: number;
      priceInclVat: number;
      vatAmount: number;
      currency: string;
    },
  ) {
    const pkg = creditPackages.find((item) => item.key === packageKey);
    if (!pkg) {
      throw new Error(`Credit package not found: ${packageKey}`);
    }
    const creditPackage = pkg;

    const priceExclVat = pricingData?.priceExclVat ?? creditPackage.price;
    const priceInclVat = pricingData?.priceInclVat ?? creditPackage.price;
    const vatAmount = pricingData?.vatAmount ?? 0;
    const currency = pricingData?.currency ?? "EUR";

    return deps.db.transaction(async (tx: any) => {
      async function grantCredits(grantedAt: Date) {
        const baseCredits = creditPackage.credits;
        const bonusCredits = "bonus" in creditPackage ? creditPackage.bonus : 0;
        const totalCredits = baseCredits + bonusCredits;
        const current = await getOrInitializeCredits(tx, userId);
        const newBalance = Number(current.balance) + totalCredits;

        await tx
          .update(userCredits)
          .set({
            balance: newBalance.toString(),
            totalPurchased: (Number(current.totalPurchased) + baseCredits).toString(),
            updatedAt: grantedAt,
          })
          .where(eq(userCredits.userId, userId));

        await tx.insert(creditTransactions).values({
          userId,
          type: "purchase",
          amount: baseCredits.toString(),
          description: `Package: ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
          referenceId: paymentId,
          balanceAfter: (Number(current.balance) + baseCredits).toString(),
        });

        if (bonusCredits > 0) {
          await tx.insert(creditTransactions).values({
            userId,
            type: "bonus",
            amount: bonusCredits.toString(),
            description: `Bonus credits for ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
            referenceId: paymentId,
            balanceAfter: newBalance.toString(),
            createdAt: new Date(grantedAt.getTime() + 1),
          });
        }

        await deps.notifications.createNotification({
          userId,
          title: "creditPurchaseSuccess.title",
          message: "creditPurchaseSuccess.message",
          type: "success",
          category: "billing",
          data: {
            credits: totalCredits,
            amount: priceInclVat / 100,
            currency,
          },
        });
      }

      const existingPurchase = await tx.query.creditPurchases.findFirst({
        where: eq(creditPurchases.paymentId, paymentId),
      });

      if (existingPurchase) {
        if (existingPurchase.userId !== userId) {
          throw new Error(`Payment ${paymentId} is already associated with another user`);
        }

        if (existingPurchase.creditsGrantedAt && paymentStatus !== "completed") {
          return existingPurchase;
        }

        const shouldGrantCredits = paymentStatus === "completed" && !existingPurchase.creditsGrantedAt;
        const creditsGrantedAt = shouldGrantCredits ? new Date() : existingPurchase.creditsGrantedAt;
        const nextDodoCustomerId = dodoCustomerId ?? existingPurchase.dodoCustomerId;

        if (existingPurchase.paymentStatus !== paymentStatus || dodoCustomerId || shouldGrantCredits || pricingData) {
          await tx
            .update(creditPurchases)
            .set({
              paymentStatus,
              dodoCustomerId: nextDodoCustomerId,
              price: priceInclVat,
              priceExclVat,
              priceInclVat,
              vatAmount,
              currency,
              creditsGrantedAt,
              updatedAt: new Date(),
            })
            .where(eq(creditPurchases.id, existingPurchase.id));
        }

        if (shouldGrantCredits) {
          await grantCredits(creditsGrantedAt);
        }

        return {
          ...existingPurchase,
          paymentStatus,
          dodoCustomerId: nextDodoCustomerId,
          creditsGrantedAt,
        };
      }

      const creditsGrantedAt = paymentStatus === "completed" ? new Date() : null;

      const [purchase] = await tx
        .insert(creditPurchases)
        .values({
          userId,
          packageKey,
          credits: creditPackage.credits,
          bonusCredits: "bonus" in creditPackage ? creditPackage.bonus : 0,
          price: priceInclVat,
          priceExclVat,
          priceInclVat,
          vatAmount,
          currency,
          paymentId,
          dodoCustomerId,
          paymentStatus,
          creditsGrantedAt,
        })
        .returning();

      if (creditsGrantedAt) {
        await grantCredits(creditsGrantedAt);
      }

      return purchase;
    });
  }

  async function processCreditRefund(paymentId: string, refundId?: string) {
    return deps.db.transaction(async (tx: any) => {
      const purchase = await tx.query.creditPurchases.findFirst({
        where: eq(creditPurchases.paymentId, paymentId),
      });

      if (!purchase) {
        throw new Error(`Payment ${paymentId} not found for refund`);
      }

      if (!purchase.creditsGrantedAt) {
        await tx
          .update(creditPurchases)
          .set({ paymentStatus: "refunded", updatedAt: new Date() })
          .where(eq(creditPurchases.id, purchase.id));
        return { ...purchase, paymentStatus: "refunded" };
      }

      if (purchase.paymentStatus === "refunded") {
        return purchase;
      }

      const current = await getOrInitializeCredits(tx, purchase.userId);
      const totalCredits = Number(purchase.credits) + Number(purchase.bonusCredits ?? 0);
      const newBalance = Math.max(0, Number(current.balance) - totalCredits);

      await tx
        .update(userCredits)
        .set({
          balance: newBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, purchase.userId));

      await tx.insert(creditTransactions).values({
        userId: purchase.userId,
        type: "refund",
        amount: (-totalCredits).toString(),
        description: `Refund: ${purchase.packageKey.charAt(0).toUpperCase() + purchase.packageKey.slice(1)}`,
        referenceType: "payment",
        referenceId: paymentId,
        balanceAfter: newBalance.toString(),
        metadata: { refundId },
      });

      await tx
        .update(creditPurchases)
        .set({ paymentStatus: "refunded", updatedAt: new Date() })
        .where(eq(creditPurchases.id, purchase.id));

      return { ...purchase, paymentStatus: "refunded" };
    });
  }

  async function getUserByEmail(email: string) {
    const rows = await deps.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  async function getUserById(userId: string) {
    const rows = await deps.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async function downloadInvoice(userId: string, paymentId: string) {
    const [purchase] = await deps.db
      .select({
        id: creditPurchases.id,
        userId: creditPurchases.userId,
        paymentStatus: creditPurchases.paymentStatus,
      })
      .from(creditPurchases)
      .where(eq(creditPurchases.paymentId, paymentId))
      .limit(1);

    if (!purchase) {
      throw new Error("Purchase not found");
    }

    if (purchase.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (purchase.paymentStatus !== "completed") {
      throw new Error("Invoice not available for this payment");
    }

    const apiKey = deps.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error("DodoPayments API key not configured");
    }

    const baseUrl =
      deps.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
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

  return {
    getCreditBalance,
    getCreditHistory,
    getCreditPurchases,
    processCreditPurchase,
    processCreditRefund,
    getUserByEmail,
    getUserById,
    downloadInvoice,
  };
}
