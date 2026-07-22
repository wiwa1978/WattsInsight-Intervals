import { and, desc, eq, gte, lte } from "drizzle-orm";

import { intervalsActivity, intervalsConnection } from "@platform/platform-db";
import {
  buildIntervalsAuthorizeUrl,
  decryptToken,
  encryptToken,
  exchangeIntervalsCode,
  fetchIntervalsActivities,
  normalizeIntervalsActivity,
  refreshIntervalsToken,
  type IntervalsOAuthConfig,
} from "@wattsinsight/core";

type WattsInsightDb = any;

type WattsInsightServiceDeps = {
  db: WattsInsightDb;
  oauthConfig: IntervalsOAuthConfig;
  tokenEncryptionKey: string;
};

function ensureConfigured(config: IntervalsOAuthConfig, tokenEncryptionKey: string) {
  if (!config.clientId || !config.clientSecret || !config.redirectUri || !tokenEncryptionKey) {
    throw new Error("Intervals.icu OAuth is not configured");
  }
}

function toActivityDto(activity: typeof intervalsActivity.$inferSelect) {
  return {
    id: activity.id,
    intervalsActivityId: activity.intervalsActivityId,
    name: activity.name,
    type: activity.type,
    startDateLocal: activity.startDateLocal.toISOString(),
    movingTimeSeconds: activity.movingTimeSeconds,
    elapsedTimeSeconds: activity.elapsedTimeSeconds,
    distanceMeters: activity.distanceMeters === null ? null : Number(activity.distanceMeters),
    averageHr: activity.averageHr,
  };
}

export function createWattsInsightService(deps: WattsInsightServiceDeps) {
  const { db, oauthConfig, tokenEncryptionKey } = deps;

  function buildAuthorizeUrl(state: string) {
    ensureConfigured(oauthConfig, tokenEncryptionKey);
    return buildIntervalsAuthorizeUrl(oauthConfig, state);
  }

  async function connect(userId: string, code: string) {
    ensureConfigured(oauthConfig, tokenEncryptionKey);
    const token = await exchangeIntervalsCode(oauthConfig, code);

    await db
      .insert(intervalsConnection)
      .values({
        userId,
        athleteId: token.athlete_id ?? "",
        accessToken: encryptToken(token.access_token, tokenEncryptionKey),
        refreshToken: encryptToken(token.refresh_token, tokenEncryptionKey),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: token.scope,
        status: "active",
      })
      .onConflictDoUpdate({
        target: intervalsConnection.userId,
        set: {
          athleteId: token.athlete_id ?? "",
          accessToken: encryptToken(token.access_token, tokenEncryptionKey),
          refreshToken: encryptToken(token.refresh_token, tokenEncryptionKey),
          tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
          scope: token.scope,
          status: "active",
        },
      });
  }

  async function getStatus(userId: string) {
    const [connection] = await db
      .select()
      .from(intervalsConnection)
      .where(eq(intervalsConnection.userId, userId))
      .limit(1);

    if (!connection) {
      return { connected: false, status: null, athleteId: null, lastSyncedAt: null };
    }

    return {
      connected: connection.status === "active",
      status: connection.status,
      athleteId: connection.athleteId,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    };
  }

  async function disconnect(userId: string) {
    await db
      .update(intervalsConnection)
      .set({ status: "revoked" })
      .where(eq(intervalsConnection.userId, userId));

    return { disconnected: true };
  }

  async function getActiveConnection(userId: string) {
    const [connection] = await db
      .select()
      .from(intervalsConnection)
      .where(and(eq(intervalsConnection.userId, userId), eq(intervalsConnection.status, "active")))
      .limit(1);

    return connection ?? null;
  }

  async function ensureFreshAccessToken(connection: typeof intervalsConnection.$inferSelect) {
    if (connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
      return decryptToken(connection.accessToken, tokenEncryptionKey);
    }

    const refreshed = await refreshIntervalsToken(oauthConfig, decryptToken(connection.refreshToken, tokenEncryptionKey));

    await db
      .update(intervalsConnection)
      .set({
        accessToken: encryptToken(refreshed.access_token, tokenEncryptionKey),
        refreshToken: encryptToken(refreshed.refresh_token, tokenEncryptionKey),
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      })
      .where(eq(intervalsConnection.id, connection.id));

    return refreshed.access_token;
  }

  async function listActivities(userId: string, range: { start: string; end: string }) {
    const activities = await db
      .select()
      .from(intervalsActivity)
      .where(
        and(
          eq(intervalsActivity.userId, userId),
          gte(intervalsActivity.startDateLocal, new Date(range.start)),
          lte(intervalsActivity.startDateLocal, new Date(range.end)),
        ),
      )
      .orderBy(desc(intervalsActivity.startDateLocal));

    return activities.map(toActivityDto);
  }

  async function syncActivities(userId: string, range: { start: string; end: string }) {
    ensureConfigured(oauthConfig, tokenEncryptionKey);
    const connection = await getActiveConnection(userId);
    if (!connection) {
      throw new Error("No active Intervals.icu connection");
    }

    const accessToken = await ensureFreshAccessToken(connection);
    const rawActivities = await fetchIntervalsActivities(accessToken, connection.athleteId, range);

    let insertedOrUpdated = 0;
    for (const raw of rawActivities) {
      const normalized = normalizeIntervalsActivity(raw);

      await db
        .insert(intervalsActivity)
        .values({ userId, connectionId: connection.id, ...normalized })
        .onConflictDoUpdate({
          target: [intervalsActivity.userId, intervalsActivity.intervalsActivityId],
          set: normalized,
        });

      insertedOrUpdated += 1;
    }

    await db
      .update(intervalsConnection)
      .set({ lastSyncedAt: new Date() })
      .where(eq(intervalsConnection.id, connection.id));

    return { synced: true, insertedOrUpdated };
  }

  return { buildAuthorizeUrl, connect, getStatus, disconnect, listActivities, syncActivities };
}
