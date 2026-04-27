import { z } from "zod";

import { errorCode, type ErrorCode } from "@platform/contracts/wire";

type JsonContext = {
  get: (key: "requestId") => string | undefined;
  json: (body: unknown, status?: number) => Response;
};

export function validationError(c: JsonContext, message: string) {
  return fail(c, message, 400, { errorCode: errorCode.validationFailed });
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
  return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
}

export function ok<T>(c: JsonContext, data: T, status = 200) {
  return c.json({ success: true, data }, status);
}

export function fail(
  c: JsonContext,
  error: string,
  status = 400,
  extra?: Record<string, unknown> & { errorCode?: ErrorCode },
) {
  const requestId = c.get("requestId");
  const response = c.json({ ...(extra ?? {}), success: false, error, ...(requestId ? { requestId } : {}) }, status);

  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }

  if (extra?.errorCode) {
    response.headers.set("x-error-code", extra.errorCode);
  }

  return response;
}

export function badRequest(c: JsonContext, error: string, extra?: Record<string, unknown>) {
  return fail(c, error, 400, { ...(extra ?? {}), errorCode: errorCode.badRequest });
}

export function unauthorized(c: JsonContext, error = "Unauthorized", extra?: Record<string, unknown>) {
  return fail(c, error, 401, { ...(extra ?? {}), errorCode: errorCode.unauthorized });
}

export function forbidden(c: JsonContext, error = "Forbidden", extra?: Record<string, unknown>) {
  return fail(c, error, 403, { ...(extra ?? {}), errorCode: errorCode.forbidden });
}

export function notFound(c: JsonContext, error = "Not found", extra?: Record<string, unknown>) {
  return fail(c, error, 404, { ...(extra ?? {}), errorCode: errorCode.notFound });
}

export function serverError(c: JsonContext, error = "Internal server error", extra?: Record<string, unknown>) {
  return fail(c, error, 500, { ...(extra ?? {}), errorCode: errorCode.internalServerError });
}
