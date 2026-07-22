import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const intervalsConnection = pgTable(
  "intervals_connection",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    athleteId: text("athlete_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    scope: text("scope").notNull(),
    status: text("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("intervals_connection_user_unique").on(table.userId)],
);

export const intervalsActivity = pgTable(
  "intervals_activity",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id")
      .references(() => intervalsConnection.id, { onDelete: "cascade" })
      .notNull(),
    intervalsActivityId: text("intervals_activity_id").notNull(),
    name: text("name"),
    type: text("type"),
    startDateLocal: timestamp("start_date_local", { withTimezone: true }).notNull(),
    movingTimeSeconds: integer("moving_time_seconds"),
    elapsedTimeSeconds: integer("elapsed_time_seconds"),
    distanceMeters: numeric("distance_meters"),
    averageHr: integer("average_hr"),
    rawPayload: jsonb("raw_payload"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("intervals_activity_user_activity_unique").on(table.userId, table.intervalsActivityId),
    index("intervals_activity_user_start_idx").on(table.userId, table.startDateLocal),
  ],
);
