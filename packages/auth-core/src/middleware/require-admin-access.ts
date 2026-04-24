import { hasAdminAccess, normalizeAuthEmail } from "@platform/auth-shared";

import type { AuthMiddleware } from "../types";

type AuthUser = {
  role?: string | null;
  email?: string | null;
};

type RequireAdminAccessOptions = {
  allowlist: Set<string>;
};

export function createRequireAdminAccess(options: RequireAdminAccessOptions): AuthMiddleware {
  return async (c, next) => {
    const user = c.get("authUser") as AuthUser | undefined;
    const email = normalizeAuthEmail(user?.email);
    const isAllowedEmail = options.allowlist.has(email);

    if (!hasAdminAccess(user) || !isAllowedEmail) {
      const response = c.json(
        {
          success: false,
          error: "Forbidden",
          code: "ADMIN_FORBIDDEN",
          invalidateSession: true,
          redirectTo: "/login?reason=forbidden-admin",
        },
        403,
      );

      response.headers.set("x-auth-invalidate", "1");
      return response;
    }

    await next();
  };
}
