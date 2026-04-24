import { normalizeAuthRole } from "@platform/auth-shared";

import type { AuthMiddleware } from "../types";

type SessionShape = {
  user?: {
    id?: string;
    role?: string | null;
    email?: string | null;
  };
  session?: unknown;
};

type TokenUser = {
  id: string;
  role?: string | null;
  email?: string | null;
};

type GetAuthContext = (headers: Headers) => Promise<SessionShape | { user: TokenUser; session: null } | null>;

export function createRequireAuth(getAuthContext: GetAuthContext): AuthMiddleware {
  return async (c, next) => {
    const session = await getAuthContext(c.req.raw.headers);

    if (!session?.user?.id) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    c.set("authUser", {
      id: session.user.id,
      role: normalizeAuthRole(session.user.role),
      email: session.user.email ?? null,
    });
    c.set("authSession", session.session ?? null);
    await next();
  };
}
