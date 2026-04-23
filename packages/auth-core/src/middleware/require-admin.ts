import type { MiddlewareHandler } from "hono";

import { hasAdminAccess } from "@platform/auth-shared";

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = (c as any).get("authUser") as { role?: string | null } | undefined;

  if (!hasAdminAccess(user)) {
    return c.json({ success: false, error: "Forbidden" }, 403);
  }

  await next();
};
