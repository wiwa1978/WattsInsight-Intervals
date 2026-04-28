import { cors } from "hono/cors";

import type { AppEnv } from "../context";
import { env } from "../env";

const allowedCorsOrigins = new Set(
  [
    env.APP_URL,
    env.API_URL,
    ...(env.ADMIN_APP_URL ? [env.ADMIN_APP_URL] : []),
    ...(env.BETTER_AUTH_ALLOWED_ORIGINS
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []),
  ],
);

const appUrlHostname = new URL(env.APP_URL).hostname;

function isAllowedCorsOrigin(origin: string) {
  if (allowedCorsOrigins.has(origin)) {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    try {
      const parsedOrigin = new URL(origin);

      // In development we accept localhost and same-hostname variants so local web/admin apps can hit the API.
      return (
        parsedOrigin.hostname === appUrlHostname
        || parsedOrigin.hostname === "localhost"
        || parsedOrigin.hostname === "127.0.0.1"
      );
    } catch {
      return false;
    }
  }

  return false;
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) {
      return env.APP_URL;
    }

    return isAllowedCorsOrigin(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
    "x-better-auth-client",
    "x-captcha-response",
  ],
  exposeHeaders: ["Content-Length", "Set-Cookie"],
  credentials: true,
});
