import { z } from "zod";

export const intervalsConnectionStatusSchema = z.object({
  connected: z.boolean(),
  status: z.enum(["active", "revoked", "error"]).nullable(),
  athleteId: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
});

export const intervalsAuthorizeUrlResponseSchema = z.object({
  url: z.string().url(),
});

export const intervalsDisconnectResponseSchema = z.object({
  disconnected: z.boolean(),
});

export type IntervalsConnectionStatus = z.infer<typeof intervalsConnectionStatusSchema>;
export type IntervalsAuthorizeUrlResponse = z.infer<typeof intervalsAuthorizeUrlResponseSchema>;
export type IntervalsDisconnectResponse = z.infer<typeof intervalsDisconnectResponseSchema>;
