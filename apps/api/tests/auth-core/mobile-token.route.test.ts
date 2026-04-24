import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the betterAuth() factory so we can stub auth.api.signInEmail
// without standing up a real Postgres + better-auth instance. The real
// `createAuthModule` (gate, route handler, token service, validators) still
// runs unmodified — this is what the previous wholesale `@platform/auth-core`
// mock was hiding.
const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  authHandler: vi.fn(async () => new Response(null, { status: 200 })),
}));

vi.mock("better-auth", () => ({
  betterAuth: () => ({
    api: { signInEmail: mocks.signInEmail },
    handler: mocks.authHandler,
  }),
}));

import { createAuthModule } from "@platform/auth-core";

type FindByIdResult = Awaited<ReturnType<Parameters<typeof createAuthModule>[0]["users"]["findById"]>>;

function buildApp(opts: { findById: () => FindByIdResult }) {
  const refreshTokens = {
    create: vi.fn(async () => {}),
    findActiveByHash: vi.fn(async () => null),
    rotate: vi.fn(async () => true),
    revokeByHash: vi.fn(async () => {}),
    cleanupExpired: vi.fn(async () => {}),
  };

  const module = createAuthModule({
    betterAuthOptions: {} as never,
    users: {
      findById: vi.fn(async () => opts.findById()),
    },
    admin: { allowlist: new Set() },
    jwt: {
      secret: "x".repeat(64),
      issuer: "test-issuer",
      audience: "test-audience",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
    },
    refreshTokens,
  });

  const app = new Hono();
  app.route("/auth/mobile", module.mobileRouter);
  return { app, refreshTokens };
}

const baseUser = {
  id: "11111111-1111-1111-1111-111111111111",
  role: "user",
  email: "user@example.com",
  emailVerified: true,
  twoFactorEnabled: false,
  banned: false,
  banExpires: null,
};

describe("POST /auth/mobile/token gate", () => {
  beforeEach(() => {
    mocks.signInEmail.mockReset();
    mocks.signInEmail.mockResolvedValue({ user: { id: baseUser.id } });
  });

  async function call(app: Hono) {
    return app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });
  }

  it("401 INVALID_CREDENTIALS when better-auth refuses sign-in", async () => {
    mocks.signInEmail.mockResolvedValueOnce({});
    const { app, refreshTokens } = buildApp({ findById: () => baseUser });
    const res = await call(app);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "INVALID_CREDENTIALS",
    });
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 EMAIL_NOT_VERIFIED when account email is unverified", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, emailVerified: false }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "EMAIL_NOT_VERIFIED",
    });
    // CRITICAL: no refresh token persisted for an ungated user
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 TWO_FACTOR_REQUIRED when account has 2FA enabled", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, twoFactorEnabled: true }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "TWO_FACTOR_REQUIRED",
    });
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 ACCOUNT_BANNED for banned accounts", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, banned: true }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "ACCOUNT_BANNED",
    });
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("401 INVALID_CREDENTIALS when persisted user has been deleted between signIn and findById", async () => {
    const { app, refreshTokens } = buildApp({ findById: () => null });
    const res = await call(app);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: "INVALID_CREDENTIALS",
    });
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("200 issues tokens for a fully verified, un-2FA, un-banned user", async () => {
    const { app, refreshTokens } = buildApp({ findById: () => baseUser });
    const res = await call(app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string; tokenType: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.tokenType).toBe("Bearer");
    expect(body.data.accessToken.length).toBeGreaterThan(16);
    expect(body.data.refreshToken.length).toBeGreaterThan(16);
    expect(refreshTokens.create).toHaveBeenCalledOnce();
  });
});
