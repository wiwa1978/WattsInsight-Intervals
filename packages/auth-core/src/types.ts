import type { BetterAuthOptions } from "better-auth";
import type { MiddlewareHandler } from "hono";

import type { AuthRole } from "@platform/auth-shared";

export type AuthGuardContext = {
  auth: {
    api: {
      getSession: (args: { headers: Headers }) => Promise<unknown>;
    };
  };
};

export type AuthModuleOptions = {
  betterAuthOptions: BetterAuthOptions;
  users: {
    findById: (userId: string) => Promise<{
      id: string;
      role?: string | null;
      email?: string | null;
    } | null>;
  };
  admin: {
    allowlist: Set<string>;
  };
  jwt: {
    secret: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  };
  refreshTokens: {
    create: (args: { tokenHash: string; userId: string; expiresAt: Date }) => Promise<void>;
    findActiveByHash: (tokenHash: string) => Promise<{ userId: string } | null>;
    rotate: (args: {
      currentTokenHash: string;
      nextTokenHash: string;
      userId: string;
      nextExpiresAt: Date;
    }) => Promise<boolean>;
    revokeByHash: (tokenHash: string) => Promise<void>;
    cleanupExpired: () => Promise<void>;
  };
};

export type AuthenticatedUser = {
  id: string;
  role?: AuthRole | null;
  email?: string | null;
};

export type AuthContextVariables = {
  authUser?: AuthenticatedUser;
  authSession?: unknown;
};

export type AuthMiddleware = MiddlewareHandler<{
  Variables: AuthContextVariables;
}>;
