import { Hono } from "hono";
import type { Context } from "hono";

import { clientLogSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { logger } from "../observability/logger";
import { Sentry } from "../observability/sentry";

const MAX_CLIENT_LOG_BYTES = 4 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const clientLogBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: Context<AppEnv>) {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return c.req.header("x-real-ip") ?? "unknown";
}

function allowClientLog(ip: string) {
  const now = Date.now();
  const bucket = clientLogBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    clientLogBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - bucket.count };
}

export function createLogsRouter() {
  const router = new Hono<AppEnv>();

  router.post("/logs/client", async (c) => {
    const ip = getClientIp(c);
    const rateLimit = allowClientLog(ip);

    if (!rateLimit.allowed) {
      c.header("retry-after", String(Math.ceil(WINDOW_MS / 1000)));
      return c.json({ success: false, error: "Too many log requests" }, 429);
    }

    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_LOG_BYTES) {
      return c.json({ success: false, error: "Log payload too large" }, 413);
    }

    const body = await c.req.text();
    if (body.length > MAX_CLIENT_LOG_BYTES) {
      return c.json({ success: false, error: "Log payload too large" }, 413);
    }

    let parsedJson: unknown = null;
    try {
      parsedJson = body ? JSON.parse(body) : null;
    } catch {
      parsedJson = null;
    }

    const parsed = clientLogSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid log payload" }, 400);
    }

    const payload = parsed.data;
    const requestId = c.get("requestId");
    const logRecord = {
      requestId,
      source: "web",
      ip,
      url: payload.url,
      userAgent: payload.userAgent,
      timestamp: payload.timestamp,
      context: payload.context,
    };

    if (payload.level === "error") {
      logger.error(logRecord, payload.message);
      Sentry.captureMessage(payload.message, {
        level: "error",
        tags: {
          source: "web",
        },
        extra: logRecord,
      });
    } else if (payload.level === "warn") {
      logger.warn(logRecord, payload.message);
      Sentry.captureMessage(payload.message, {
        level: "warning",
        tags: {
          source: "web",
        },
        extra: logRecord,
      });
    } else if (payload.level === "info") {
      logger.info(logRecord, payload.message);
    } else {
      logger.debug(logRecord, payload.message);
    }

    c.set("clientLogRemaining", rateLimit.remaining);
    return c.json({ success: true });
  });

  return router;
}
