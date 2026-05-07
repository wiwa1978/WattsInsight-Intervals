import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, gte, like, lt, lte, sql } from "drizzle-orm";

import { discounts } from "@platform/platform-db";

import { isProviderTimeout, withProviderTimeout } from "../../lib/provider-fetch";

type ProviderDiscountType = "percentage";

type ProviderDiscount = {
  discount_id: string;
  code: string | null;
  amount: number;
  type: ProviderDiscountType;
};

type ProviderCreateDiscountRequest = {
  amount: number;
  type: ProviderDiscountType;
  code: string | null;
  expires_at: string | null;
  name: string | null;
  restricted_to: string[] | null;
  subscription_cycles: number | null;
  usage_limit: number | null;
};

type ProviderUpdateDiscountRequest = Partial<ProviderCreateDiscountRequest>;

type DiscountType = "fixed" | "percentage";
type DiscountStatus = "active" | "inactive" | "expired";

type CreateDiscountInput = {
  code: string;
  type: DiscountType;
  value: number;
  startDate: Date;
  endDate: Date;
  maxUses?: number | null;
};

type UpdateDiscountInput = {
  id: string;
  code?: string;
  type?: DiscountType;
  value?: number;
  startDate?: Date;
  endDate?: Date;
  maxUses?: number | null;
  status?: DiscountStatus;
};

type DiscountsServiceDeps = {
  db: any;
  env: {
    DODO_PAYMENTS_API_KEY?: string;
    DODO_PAYMENTS_ENVIRONMENT: "test_mode" | "live_mode";
  };
};

function inferDiscountStatus(startDate: Date, endDate: Date, now = new Date()): DiscountStatus {
  if (now < startDate) return "inactive";
  if (now > endDate) return "expired";
  return "active";
}

function getStatusWhereClause(status: DiscountStatus, now: Date) {
  if (status === "active") return and(lte(discounts.startDate, now), gte(discounts.endDate, now));
  if (status === "inactive") return gt(discounts.startDate, now);
  return lt(discounts.endDate, now);
}

function discountFailure(error: string) {
  return { success: false as const, error };
}

function discountSuccess(payload: Record<string, unknown>) {
  return { success: true as const, ...payload };
}

function getDodoApiBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

function withProviderDiscountId<T extends { dodoDiscountId?: string | null }>(discount: T) {
  return {
    ...discount,
    providerDiscountId: discount.dodoDiscountId ?? null,
  };
}

export function createDiscountsService(deps: DiscountsServiceDeps) {
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

  async function refreshDiscountStatus<T extends { id: string; status: DiscountStatus; startDate: Date; endDate: Date }>(
    discount: T,
    now = new Date(),
  ): Promise<T> {
    const refreshedStatus = inferDiscountStatus(discount.startDate, discount.endDate, now);
    if (refreshedStatus === discount.status) {
      return discount;
    }

    await deps.db
      .update(discounts)
      .set({ status: refreshedStatus, updatedAt: new Date() })
      .where(eq(discounts.id, discount.id));

    return { ...discount, status: refreshedStatus };
  }

  async function providerDiscountRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = deps.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error("DODO_PAYMENTS_API_KEY is not configured");
    }

    const url = `${getDodoApiBaseUrl(deps.env.DODO_PAYMENTS_ENVIRONMENT)}${endpoint}`;
    let response: Response;
    try {
      response = await fetch(
        url,
        withProviderTimeout({
          ...options,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
          },
        }),
      );
    } catch (error) {
      throw new Error(isProviderTimeout(error) ? "Discount provider request timed out" : "Discount provider request failed");
    }

    if (!response.ok) {
      throw new Error("Discount provider request failed");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function createProviderDiscount(data: ProviderCreateDiscountRequest): Promise<ProviderDiscount> {
    return providerDiscountRequest<ProviderDiscount>("/discounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async function updateProviderDiscount(id: string, data: ProviderUpdateDiscountRequest): Promise<ProviderDiscount> {
    return providerDiscountRequest<ProviderDiscount>(`/discounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async function deleteProviderDiscount(id: string): Promise<void> {
    await providerDiscountRequest<void>(`/discounts/${id}`, {
      method: "DELETE",
    });
  }

  async function listProviderDiscounts(): Promise<ProviderDiscount[]> {
    return providerDiscountRequest<ProviderDiscount[]>("/discounts");
  }

  async function validateProviderDiscountCode(code: string): Promise<{ valid: boolean }> {
    const list = await listProviderDiscounts();
    const found = list.find((item) => item.code === code);
    return { valid: !found };
  }

  async function validateDiscountCode(code: string, excludeId?: string) {
    const normalizedCode = code.trim().toUpperCase();

    const existing = await deps.db.query.discounts.findFirst({
      where: excludeId
        ? and(eq(discounts.code, normalizedCode), sql`${discounts.id} != ${excludeId}`)
        : eq(discounts.code, normalizedCode),
    });

    if (existing) {
      return { valid: false, error: "Discount code already exists" };
    }

    const providerValidation = await validateProviderDiscountCode(normalizedCode);
    if (!providerValidation.valid) {
      return { valid: false, error: "Discount code already exists in payment provider" };
    }

    return { valid: true };
  }

  async function generateDiscountCode(overridePrefix?: string): Promise<string> {
    const prefix = overridePrefix || "DSCT";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for (let attempt = 0; attempt < 20; attempt++) {
      const p1 = Array.from(randomBytes(3)).map((byte) => alphabet[byte % alphabet.length]).join("");
      const p2 = Array.from(randomBytes(4)).map((byte) => alphabet[byte % alphabet.length]).join("");
      const code = `${prefix}-${p1}-${p2}`;

      const existing = await deps.db.query.discounts.findFirst({
        where: eq(discounts.code, code),
      });

      if (!existing) {
        return code;
      }
    }

    throw new Error("Failed to generate unique discount code");
  }

  async function getDiscounts(limit = 20, offset = 0, search?: string, status?: DiscountStatus) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const now = new Date();
    const whereConditions = [] as any[];

    if (search?.trim()) whereConditions.push(like(discounts.code, `%${search.trim().toUpperCase()}%`));
    if (status) whereConditions.push(getStatusWhereClause(status, now));

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const discountsList = await deps.db.query.discounts.findMany({
      where: whereClause,
      orderBy: desc(discounts.createdAt),
      limit: normalizedLimit,
      offset: normalizedOffset,
      with: {
        userDiscounts: {
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
      },
    });

    const refreshedDiscountsList = await Promise.all(
      discountsList.map((discount: any) => refreshDiscountStatus(discount, now)),
    );

    const totalResult = await deps.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(discounts)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;
    return {
      discounts: refreshedDiscountsList.map(withProviderDiscountId),
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function getDiscountById(id: string) {
    const discount = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, id),
      with: {
        userDiscounts: {
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
      },
    });

    if (!discount) {
      return { success: false, discount: null, error: "Discount not found" };
    }

    const refreshedDiscount = await refreshDiscountStatus(discount);
    return { success: true, discount: withProviderDiscountId(refreshedDiscount) };
  }

  async function createDiscount(input: CreateDiscountInput) {
    if (input.type !== "percentage") {
      return discountFailure("Only percentage discounts are supported");
    }

    if (input.value <= 0 || input.value > 100) {
      return discountFailure("Percentage discounts must be between 0.01 and 100");
    }

    if (input.endDate <= input.startDate) {
      return discountFailure("End date must be after start date");
    }

    const normalizedCode = input.code.trim().toUpperCase();
    const codeValidation = await validateDiscountCode(normalizedCode);
    if (!codeValidation.valid) {
      return discountFailure(codeValidation.error || "Invalid discount code");
    }

    const providerDiscountData: ProviderCreateDiscountRequest = {
      amount: Math.round(input.value * 100),
      type: "percentage",
      code: normalizedCode,
      expires_at: input.endDate.toISOString(),
      name: null,
      restricted_to: null,
      subscription_cycles: null,
      usage_limit: input.maxUses ?? null,
    };

    const providerDiscount = await createProviderDiscount(providerDiscountData);
    const status = inferDiscountStatus(input.startDate, input.endDate);

    let created;
    try {
      created = await deps.db.transaction(async (tx: DiscountsServiceDeps["db"]) => {
        const [createdDiscount] = await tx
          .insert(discounts)
          .values({
            code: normalizedCode,
            type: input.type,
            value: input.value.toString(),
            startDate: input.startDate,
            endDate: input.endDate,
            maxUses: input.maxUses,
            currentUses: 0,
            dodoDiscountId: providerDiscount.discount_id,
            status,
          })
          .returning();

        return createdDiscount;
      });
    } catch (error) {
      try {
        await deleteProviderDiscount(providerDiscount.discount_id);
      } catch {
        // Preserve the local persistence failure; reconciliation can retry provider cleanup separately.
      }
      throw error;
    }

    return discountSuccess({ discount: withProviderDiscountId(created) });
  }

  async function updateDiscount(input: UpdateDiscountInput) {
    const existing = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, input.id),
    });

    if (!existing) {
      return discountFailure("Discount not found");
    }

    if (input.type !== undefined && input.type !== "percentage") {
      return discountFailure("Only percentage discounts are supported");
    }

    if (input.value !== undefined && (input.value <= 0 || input.value > 100)) {
      return discountFailure("Percentage discounts must be between 0.01 and 100");
    }

    if (input.code && input.code !== existing.code) {
      const normalizedCode = input.code.trim().toUpperCase();
      const codeValidation = await validateDiscountCode(normalizedCode, input.id);
      if (!codeValidation.valid) {
        return discountFailure(codeValidation.error || "Invalid discount code");
      }

      input.code = normalizedCode;
    }

    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (endDate <= startDate) {
      return discountFailure("End date must be after start date");
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.code !== undefined) updateData.code = input.code;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.value !== undefined) updateData.value = input.value.toString();
    if (input.startDate !== undefined) updateData.startDate = input.startDate;
    if (input.endDate !== undefined) updateData.endDate = input.endDate;
    if (input.maxUses !== undefined) updateData.maxUses = input.maxUses;
    if (input.status !== undefined) updateData.status = input.status;

    if (existing.dodoDiscountId) {
      const providerUpdateData: ProviderUpdateDiscountRequest = {};
      if (input.code !== undefined) providerUpdateData.code = input.code;
      if (input.value !== undefined) providerUpdateData.amount = Math.round(input.value * 100);
      if (input.endDate !== undefined) providerUpdateData.expires_at = input.endDate.toISOString();
      if (input.maxUses !== undefined) providerUpdateData.usage_limit = input.maxUses ?? null;
      if (Object.keys(providerUpdateData).length > 0) {
        await updateProviderDiscount(existing.dodoDiscountId, providerUpdateData);
      }
    }

    const [updated] = await deps.db
      .update(discounts)
      .set(updateData)
      .where(eq(discounts.id, input.id))
      .returning();

    return discountSuccess({ discount: withProviderDiscountId(updated), previousDiscount: withProviderDiscountId(existing) });
  }

  async function deleteDiscount(id: string) {
    const existing = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, id),
    });

    if (!existing) {
      return discountFailure("Discount not found");
    }

    if (existing.dodoDiscountId) {
      await deleteProviderDiscount(existing.dodoDiscountId);
    }

    await deps.db.delete(discounts).where(eq(discounts.id, id));
    return discountSuccess({ previousDiscount: withProviderDiscountId(existing) });
  }

  return {
    generateDiscountCode,
    validateDiscountCode,
    createDiscount,
    getDiscounts,
    getDiscountById,
    updateDiscount,
    deleteDiscount,
  };
}
