import { Hono } from "hono";
import { requestId } from "hono/request-id";

import type { AppEnv } from "./context";
import { bootstrap } from "./bootstrap";
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

app.use("/*", requestId());
app.use("/*", corsMiddleware);
app.use("/*", requestGuardrails);
app.use("/*", requestLogger);
app.onError(errorHandler);

app.use("/auth/admin/*", bootstrap.authModule.requireAuth);
app.use("/auth/admin/*", bootstrap.authModule.requireAdminAccess);
app.use("/auth/admin/*", async (c, next) => {
  await next();

  if (c.res.status === 403) {
    c.res.headers.set("Set-Cookie", "better-auth.session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
  }
});

app.route("/auth", bootstrap.authModule.router);
app.route("/session", bootstrap.authModule.sessionRouter);
app.route("/auth/mobile", bootstrap.authModule.mobileRouter);
app.route("/", createSystemRouter());
app.route("/", createLogsRouter());
app.route("/", createPaymentsRouter());
app.route("/me", createMeRouter());
app.route("/admin", createAdminRouter());
app.route("/auth", createAuthRouter());
app.route("/", createDocsRouter());

export { app };
