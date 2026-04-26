import { z } from "zod";

type JsonContext = {
  json: (body: unknown, status?: number) => Response;
};

export function validationError(c: JsonContext, message: string) {
  return c.json({ success: false, error: message }, 400);
}

export function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  return schema.safeParse(body);
}

export function parseQuery<T>(schema: z.ZodSchema<T>, query: Record<string, string | undefined>) {
  return schema.safeParse(query);
}

export function parseParams<T>(schema: z.ZodSchema<T>, params: Record<string, string>) {
  return schema.safeParse(params);
}

export function buildErrorCode(requestId: string) {
  return `API-${requestId}`;
}

export function schemaFromZod(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, { target: "draft-7" });
}

export function ok<T>(c: JsonContext, data: T, status = 200) {
  return c.json({ success: true, data }, status);
}

export function fail(c: JsonContext, error: string, status = 400, extra?: Record<string, unknown>) {
  return c.json({ success: false, error, ...(extra ?? {}) }, status);
}

export function badRequest(c: JsonContext, error: string, extra?: Record<string, unknown>) {
  return fail(c, error, 400, extra);
}

export function unauthorized(c: JsonContext, error = "Unauthorized", extra?: Record<string, unknown>) {
  return fail(c, error, 401, extra);
}

export function forbidden(c: JsonContext, error = "Forbidden", extra?: Record<string, unknown>) {
  return fail(c, error, 403, extra);
}

export function notFound(c: JsonContext, error = "Not found", extra?: Record<string, unknown>) {
  return fail(c, error, 404, extra);
}
