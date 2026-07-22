import {
  intervalsActivitiesResponseSchema,
  intervalsAuthorizeUrlResponseSchema,
  intervalsConnectionStatusSchema,
  intervalsDisconnectResponseSchema,
  intervalsSyncResponseSchema,
  type IntervalsActivityQuery,
} from "@wattsinsight/contracts/wire";

import { apiRequest } from "./client";

export async function getIntervalsStatus() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/wattsinsight/connections/status");
  return intervalsConnectionStatusSchema.parse(result.data);
}

export async function getIntervalsAuthorizeUrl() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/wattsinsight/connections/authorize-url");
  return intervalsAuthorizeUrlResponseSchema.parse(result.data);
}

export async function disconnectIntervals() {
  const result = await apiRequest<{ success: boolean; data: unknown }>("/wattsinsight/connections", { method: "DELETE" });
  return intervalsDisconnectResponseSchema.parse(result.data);
}

export async function getIntervalsActivities(range: IntervalsActivityQuery) {
  const params = new URLSearchParams(range);
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/wattsinsight/activities?${params.toString()}`);
  return intervalsActivitiesResponseSchema.parse(result.data);
}

export async function syncIntervalsActivities(range: IntervalsActivityQuery) {
  const params = new URLSearchParams(range);
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/wattsinsight/activities/sync?${params.toString()}`, { method: "POST" });
  return intervalsSyncResponseSchema.parse(result.data);
}
