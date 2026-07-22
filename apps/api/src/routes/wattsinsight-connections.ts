import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { badRequest, ok } from "../lib/http";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createWattsInsightConnectionsRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/authorize-url", (c) => {
    const state = randomBytes(24).toString("base64url");
    return ok(c, { url: bootstrap.wattsInsightService.buildAuthorizeUrl(state) });
  });

  router.get("/status", async (c) => {
    const authUser = getAuthUser(c);
    return ok(c, await bootstrap.wattsInsightService.getStatus(authUser.id));
  });

  router.post("/callback", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const code = body && typeof body === "object" && "code" in body ? body.code : null;
    if (typeof code !== "string") {
      return badRequest(c, "Missing OAuth code");
    }

    await bootstrap.wattsInsightService.connect(authUser.id, code);
    return ok(c, { connected: true });
  });

  router.delete("/", async (c) => {
    const authUser = getAuthUser(c);
    return ok(c, await bootstrap.wattsInsightService.disconnect(authUser.id));
  });

  return router;
}
