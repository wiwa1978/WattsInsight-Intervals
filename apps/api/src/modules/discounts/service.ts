import { randomBytes } from "node:crypto";

import { and, desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";

import { discounts, user, userDiscounts } from "@platform/platform-db";

import { isProviderTimeout, withProviderTimeout } from "../../lib/provider-fetch";

type DodoDiscountType = "percentage";

type DodoDiscount = {
  discount_id: string;
  code: string | null;
  amount: number;
  type: DodoDiscountType;
};

type DodoCreateDiscountRequest = {
  amount: number;
  type: DodoDiscountType;
  code: string | null;
  expires_at: string | null;
  name: string | null;
  restricted_to: string[] | null;
  subscription_cycles: number | null;
  usage_limit: number | null;
};

type DodoUpdateDiscountRequest = Partial<DodoCreateDiscountRequest>;

type DiscountType = "fixed" | "percentage";
type DiscountStatus = "active" | "inactive" | "expired";

type CreateDiscountInput = {
  code: string;
  type: DiscountType;
  value: number;
  startDate: Date;
  endDate: Date;
  maxUses?: number | null;
  userIds?: string[];
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

function inferDiscountStatus(startDate: Date, endDate: Date): DiscountStatus {
  const now = new Date();
  if (now < startDate) return "inactive";
  if (now > endDate) return "expired";
  return "active";
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

  function dedupeIds(ids: string[]) {
    return [...new Set(ids.map((value) => value.trim()).filter(Boolean))];
  }

  async function dodoRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      throw new Error(isProviderTimeout(error) ? "Dodo provider request timed out" : "Dodo provider request failed");
    }

    if (!response.ok) {
      throw new Error("Dodo provider request failed");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function createDodoDiscount(data: DodoCreateDiscountRequest): Promise<DodoDiscount> {
    return dodoRequest<DodoDiscount>("/discounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async function updateDodoDiscount(id: string, data: DodoUpdateDiscountRequest): Promise<DodoDiscount> {
    return dodoRequest<DodoDiscount>(`/discounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async function deleteDodoDiscount(id: string): Promise<void> {
    await dodoRequest<void>(`/discounts/${id}`, {
      method: "DELETE",
    });
  }

  async function listDodoDiscounts(): Promise<DodoDiscount[]> {
    return dodoRequest<DodoDiscount[]>("/discounts");
  }

  async function validateDodoDiscountCode(code: string): Promise<{ valid: boolean }> {
    const list = await listDodoDiscounts();
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

    const dodoValidation = await validateDodoDiscountCode(normalizedCode);
    if (!dodoValidation.valid) {
      return { valid: false, error: "Discount code already exists in Dodo Payments" };
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
    const whereConditions = [] as any[];

    if (search?.trim()) whereConditions.push(like(discounts.code, `%${search.trim().toUpperCase()}%`));
    if (status) whereConditions.push(eq(discounts.status, status));

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

    const totalResult = await deps.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(discounts)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;
    return {
      discounts: discountsList,
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

    await updateDiscountStatus(id);
    return { success: true, discount };
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

    const dodoDiscountData: DodoCreateDiscountRequest = {
      amount: Math.round(input.value * 100),
      type: "percentage",
      code: normalizedCode,
      expires_at: input.endDate.toISOString(),
      name: null,
      restricted_to: null,
      subscription_cycles: null,
      usage_limit: input.maxUses ?? null,
    };

    const dodoDiscount = await createDodoDiscount(dodoDiscountData);
    const status = inferDiscountStatus(input.startDate, input.endDate);

    const [created] = await deps.db
      .insert(discounts)
        .values({
          code: normalizedCode,
          type: input.type,
          value: input.value.toString(),
        startDate: input.startDate,
        endDate: input.endDate,
        maxUses: input.maxUses,
        currentUses: 0,
        dodoDiscountId: dodoDiscount.discount_id,
        status,
      })
      .returning();

    const dedupedUserIds = dedupeIds(input.userIds ?? []);

    if (dedupedUserIds.length > 0) {
      await deps.db.insert(userDiscounts).values(
        dedupedUserIds.map((userId) => ({
          discountId: created.id,
          userId,
        })),
      );
    }

    return discountSuccess({ discount: created });
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
      const dodoUpdateData: DodoUpdateDiscountRequest = {};
      if (input.value !== undefined) dodoUpdateData.amount = Math.round(input.value * 100);
      if (input.endDate !== undefined) dodoUpdateData.expires_at = input.endDate.toISOString();
      if (input.maxUses !== undefined) dodoUpdateData.usage_limit = input.maxUses ?? null;
      await updateDodoDiscount(existing.dodoDiscountId, dodoUpdateData);
    }

    const [updated] = await deps.db
      .update(discounts)
      .set(updateData)
      .where(eq(discounts.id, input.id))
      .returning();

    return discountSuccess({ discount: updated });
  }

  async function deleteDiscount(id: string) {
    const existing = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, id),
    });

    if (!existing) {
      return discountFailure("Discount not found");
    }

    if (existing.dodoDiscountId) {
      await deleteDodoDiscount(existing.dodoDiscountId);
    }

    await deps.db.delete(discounts).where(eq(discounts.id, id));
    return discountSuccess({});
  }

  async function assignDiscountToUsers(discountId: string, userIds: string[]) {
    const dedupedUserIds = dedupeIds(userIds);
    const discount = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, discountId),
    });
    if (!discount) {
      return discountFailure("Discount not found");
    }

    if (discount.maxUses !== null) {
      const currentCount = await deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(userDiscounts)
        .where(eq(userDiscounts.discountId, discountId));

      const currentUses = currentCount[0]?.count || 0;
      if (currentUses + dedupedUserIds.length > discount.maxUses) {
        return discountFailure(`Cannot assign discount: would exceed maximum uses (${discount.maxUses})`);
      }
    }

    if (dedupedUserIds.length === 0) {
      return discountSuccess({ assignedCount: 0 });
    }

    const existingAssociations = await deps.db.query.userDiscounts.findMany({
      where: and(eq(userDiscounts.discountId, discountId), inArray(userDiscounts.userId, dedupedUserIds)),
    });

    const existingIds = new Set(existingAssociations.map((item: any) => item.userId));
    const newIds = dedupedUserIds.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return discountSuccess({ message: "All selected users already have this discount" });
    }

    await deps.db
      .insert(userDiscounts)
      .values(
        newIds.map((userId) => ({
          discountId,
          userId,
        })),
      )
      .onConflictDoNothing();

    return discountSuccess({ assignedCount: newIds.length });
  }

  async function removeDiscountFromUsers(discountId: string, userIds: string[]) {
    const dedupedUserIds = dedupeIds(userIds);
    const discount = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, discountId),
    });
    if (!discount) {
      return discountFailure("Discount not found");
    }

    if (dedupedUserIds.length === 0) {
      return discountSuccess({ removedCount: 0 });
    }

    await deps.db
      .delete(userDiscounts)
      .where(and(eq(userDiscounts.discountId, discountId), inArray(userDiscounts.userId, dedupedUserIds)));

    return discountSuccess({ removedCount: dedupedUserIds.length });
  }

  async function searchUsersForDiscount(query: string, limit = 20) {
    const normalizedQuery = query.trim();
    const normalizedLimit = normalizeLimit(limit, 50);

    if (!normalizedQuery || normalizedQuery.length < 2) {
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

  async function updateDiscountStatus(discountId: string) {
    const discount = await deps.db.query.discounts.findFirst({
      where: eq(discounts.id, discountId),
    });
    if (!discount) return;

    const now = new Date();
    let newStatus = discount.status as DiscountStatus;

    if (discount.status === "active") {
      if (now > discount.endDate) {
        newStatus = "expired";
      } else if (now < discount.startDate) {
        newStatus = "inactive";
      }
    } else if (discount.status === "inactive" && now >= discount.startDate && now <= discount.endDate) {
      newStatus = "active";
    }

    if (newStatus !== discount.status) {
      await deps.db
        .update(discounts)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(discounts.id, discountId));
    }
  }

  return {
    generateDiscountCode,
    validateDiscountCode,
    createDiscount,
    getDiscounts,
    getDiscountById,
    updateDiscount,
    deleteDiscount,
    assignDiscountToUsers,
    removeDiscountFromUsers,
    searchUsersForDiscount,
  };
}
