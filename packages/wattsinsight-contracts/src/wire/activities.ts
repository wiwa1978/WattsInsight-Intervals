import { z } from "zod";

export const intervalsActivityQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const intervalsActivitySchema = z.object({
  id: z.string(),
  intervalsActivityId: z.string(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  startDateLocal: z.string(),
  movingTimeSeconds: z.number().nullable(),
  elapsedTimeSeconds: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  averageHr: z.number().nullable(),
});

export const intervalsActivitiesResponseSchema = z.object({
  activities: z.array(intervalsActivitySchema),
});

export const intervalsSyncResponseSchema = z.object({
  synced: z.boolean(),
  insertedOrUpdated: z.number().int().nonnegative(),
});

export type IntervalsActivityQuery = z.infer<typeof intervalsActivityQuerySchema>;
export type IntervalsActivityDto = z.infer<typeof intervalsActivitySchema>;
export type IntervalsActivitiesResponse = z.infer<typeof intervalsActivitiesResponseSchema>;
export type IntervalsSyncResponse = z.infer<typeof intervalsSyncResponseSchema>;
