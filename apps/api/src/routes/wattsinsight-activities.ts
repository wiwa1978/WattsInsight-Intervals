import { Hono } from "hono";
import type { Context } from "hono";

import { intervalsActivityQuerySchema } from "@wattsinsight/contracts/wire";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { badRequest, ok, parseQuery } from "../lib/http";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

export function createWattsInsightActivitiesRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/", async (c) => {
    const authUser = getAuthUser(c);
    const parsed = parseQuery(intervalsActivityQuerySchema, c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Invalid activity query");
    }

    return ok(c, { activities: await bootstrap.wattsInsightService.listActivities(authUser.id, parsed.data) });
  });

  router.post("/sync", async (c) => {
    const authUser = getAuthUser(c);
    const parsed = parseQuery(intervalsActivityQuerySchema, c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Invalid sync range");
    }

    return ok(c, await bootstrap.wattsInsightService.syncActivities(authUser.id, parsed.data));
  });

  return router;
}
