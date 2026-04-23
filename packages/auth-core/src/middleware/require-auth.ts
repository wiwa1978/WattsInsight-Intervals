import type { MiddlewareHandler } from "hono";

import { normalizeAuthRole } from "@platform/auth-shared";

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

export function createRequireAuth(getAuthContext: GetAuthContext): MiddlewareHandler {
  return async (c, next) => {
    const session = await getAuthContext(c.req.raw.headers);

    if (!session?.user?.id) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const ctx = c as any;

    ctx.set("authUser", {
      id: session.user.id,
      role: normalizeAuthRole(session.user.role),
      email: session.user.email ?? null,
    });
    ctx.set("authSession", session.session ?? null);
    await next();
  };
}
