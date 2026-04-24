import { Hono } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";

export function createAuthRouter() {
  const router = new Hono<AppEnv>();

  router.post("/admin/stop-impersonating", async (c) => {
    const adminAuthApi = resolveAdminAuthApi(bootstrap.authModule);
    if (!adminAuthApi) {
      return c.json({ success: false, error: "Better Auth admin API is unavailable" }, 500);
    }

    const response = (await adminAuthApi.stopImpersonating({
      headers: c.req.raw.headers,
      asResponse: true,
    })) as Response;

    return createJsonResponseFromAuthResponse(response, "Failed to stop impersonation");
  });

  return router;
}
