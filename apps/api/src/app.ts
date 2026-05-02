import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { clearAdminStepUpCookieHeader, isAdminStepUpVerified } from "./middleware/admin-step-up";

import type { AppEnv } from "./context";
import { bootstrap } from "./bootstrap";
import { env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { requestGuardrails } from "./middleware/request-guardrails";
import { requestLogger } from "./middleware/request-logger";
import { createAdminRouter } from "./routes/admin";
import { createAuthRouter } from "./routes/auth";
import { createDocsRouter } from "./routes/docs";
import { createLogsRouter } from "./routes/logs";
import { createMeRouter } from "./routes/me";
import { createPaymentsRouter } from "./routes/payments";
import { createSystemRouter } from "./routes/system";

const app = new Hono<AppEnv>();

function clearSessionCookieHeader() {
  const parts = [
    "better-auth.session_token=",
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${env.COOKIE_SAMESITE}`,
  ];

  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  if (env.NODE_ENV === "production") parts.push("Secure");

  return parts.join("; ");
}

app.use("/*", requestId());
app.use("/*", corsMiddleware);
app.use("/*", requestGuardrails);
app.use("/*", requestLogger);
app.onError(errorHandler);

app.use("/auth/admin/*", bootstrap.authModule.requireAuth);
app.use("/auth/admin/*", bootstrap.authModule.requireAdminAccess);
app.use("/auth/admin/*", async (c, next) => {
  if (c.req.path === "/auth/admin/stop-impersonating") {
    return next();
  }

  const authUser = c.get("authUser");
  if (!authUser?.id) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const verified = isAdminStepUpVerified(c.req.raw.headers, authUser.id);
  c.set("adminStepUpVerified", verified);

  return bootstrap.authModule.requireAdminStepUp(c, next);
});
app.use("/auth/admin/*", async (c, next) => {
  await next();

  if (c.res.status === 403) {
    c.res.headers.append("Set-Cookie", clearSessionCookieHeader());
    c.res.headers.append("Set-Cookie", clearAdminStepUpCookieHeader());
  }
});

app.route("/auth", bootstrap.authModule.router);
app.route("/session", bootstrap.authModule.sessionRouter);
app.route("/auth/mobile", bootstrap.authModule.mobileRouter);
app.route("/", createSystemRouter());
app.route("/", createLogsRouter());
app.route("/", createPaymentsRouter());
app.route("/me", createMeRouter());
app.use("/admin/*", bootstrap.authModule.requireAuth);
app.use("/admin/*", bootstrap.authModule.requireAdminAccess);
app.use("/admin/*", async (c, next) => {
  if (c.req.path === "/admin/session" || c.req.path === "/admin/status" || c.req.path.startsWith("/admin/step-up")) {
    return next();
  }

  const authUser = c.get("authUser");
  if (!authUser?.id) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const verified = isAdminStepUpVerified(c.req.raw.headers, authUser.id);
  c.set("adminStepUpVerified", verified);

  await next();
});
app.use("/admin/*", async (c, next) => {
  if (c.req.path === "/admin/session" || c.req.path === "/admin/status" || c.req.path.startsWith("/admin/step-up")) {
    return next();
  }

  return bootstrap.authModule.requireAdminStepUp(c, next);
});
app.route("/admin", createAdminRouter());
app.route("/auth", createAuthRouter());
app.route("/", createDocsRouter());

export { app };
