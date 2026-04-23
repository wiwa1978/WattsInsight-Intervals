import { z } from "zod";

export const errorResultSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
});

export const successResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const actionResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([successResultSchema(dataSchema), errorResultSchema]);

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };
