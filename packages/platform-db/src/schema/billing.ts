import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const userCredits = pgTable(
  "user_credits",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    balance: decimal("balance", { precision: 10, scale: 2 }).default("0").notNull(),
    totalPurchased: decimal("total_purchased", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("user_credits_user_id_idx").on(table.userId)],
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type")
      .$type<"purchase" | "usage" | "refund" | "bonus" | "admin_adjustment">()
      .notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    description: text("description").notNull(),
    referenceType: text("reference_type").$type<"payment" | "feature_usage" | "admin" | "bonus">(),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
    balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("credit_transactions_user_id_idx").on(table.userId),
    index("credit_transactions_type_idx").on(table.type),
    index("credit_transactions_created_at_idx").on(table.createdAt),
    index("credit_transactions_type_created_at_idx").on(table.type, table.createdAt),
  ],
);

export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    packageKey: text("package_key").notNull(),
    credits: integer("credits").notNull(),
    bonusCredits: integer("bonus_credits").default(0).notNull(),
    price: integer("price").notNull(),
    priceExclVat: integer("price_excl_vat").notNull(),
    priceInclVat: integer("price_incl_vat").notNull(),
    vatAmount: integer("vat_amount").notNull(),
    currency: text("currency").default("EUR").notNull(),
    paymentProvider: text("payment_provider").default("dodo").notNull(),
    paymentId: text("payment_id").notNull(),
    dodoCustomerId: text("dodo_customer_id"),
    paymentStatus: text("payment_status")
      .$type<"pending" | "completed" | "failed" | "refunded">()
      .default("pending")
      .notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("credit_purchases_user_id_idx").on(table.userId),
    uniqueIndex("credit_purchases_provider_payment_id_idx").on(table.paymentProvider, table.paymentId),
    index("credit_purchases_payment_id_idx").on(table.paymentId),
    index("credit_purchases_dodo_customer_id_idx").on(table.dodoCustomerId),
    index("credit_purchases_payment_status_created_at_idx").on(table.paymentStatus, table.createdAt),
  ],
);

export const discounts = pgTable(
  "discounts",
  {
    id,
    code: text("code").notNull().unique(),
    type: text("type").$type<"fixed" | "percentage">().notNull(),
    value: decimal("value", { precision: 10, scale: 2 }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses"),
    currentUses: integer("current_uses").default(0).notNull(),
    dodoDiscountId: text("dodo_discount_id").unique(),
    status: text("status")
      .$type<"active" | "inactive" | "expired">()
      .default("active")
      .notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("discounts_code_idx").on(table.code),
    index("discounts_dodo_discount_id_idx").on(table.dodoDiscountId),
    index("discounts_status_idx").on(table.status),
    index("discounts_start_date_idx").on(table.startDate),
    index("discounts_end_date_idx").on(table.endDate),
  ],
);

export const userDiscounts = pgTable(
  "user_discounts",
  {
    id,
    discountId: uuid("discount_id")
      .references(() => discounts.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("user_discounts_discount_id_idx").on(table.discountId),
    index("user_discounts_user_id_idx").on(table.userId),
    index("user_discounts_discount_user_idx").on(table.discountId, table.userId),
  ],
);

export const userCreditsRelations = relations(userCredits, ({ one, many }) => ({
  user: one(user, {
    fields: [userCredits.userId],
    references: [user.id],
  }),
  transactions: many(creditTransactions),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(user, {
    fields: [creditTransactions.userId],
    references: [user.id],
  }),
}));

export const creditPurchasesRelations = relations(creditPurchases, ({ one }) => ({
  user: one(user, {
    fields: [creditPurchases.userId],
    references: [user.id],
  }),
}));

export const discountsRelations = relations(discounts, ({ many }) => ({
  userDiscounts: many(userDiscounts),
}));

export const userDiscountsRelations = relations(userDiscounts, ({ one }) => ({
  discount: one(discounts, {
    fields: [userDiscounts.discountId],
    references: [discounts.id],
  }),
  user: one(user, {
    fields: [userDiscounts.userId],
    references: [user.id],
  }),
}));
