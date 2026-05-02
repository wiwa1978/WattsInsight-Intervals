import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: () => null,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null, { status: 204 }),
}));

describe("proxy locale parsing", () => {
  it("redirects authenticated users without step-up to localized login", async () => {
    vi.resetModules();
    process.env.API_URL = "http://localhost:8787";
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            message: "Admin access granted.",
            stepUpRequired: true,
          },
        }),
      }),
    );

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/fr/login?reason=admin-step-up&callbackUrl=%2Ffr%2Fadmin%2Foverview",
    );
  });

  it("does not use public API URLs for server-side admin session checks", async () => {
    vi.resetModules();
    delete process.env.API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://public-api.example";
    process.env.NEXT_PUBLIC_MAIN_APP_URL = "http://localhost:3100";
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3100/fr/login?reason=forbidden-admin");
  });

  it("redirects localized protected routes to the same locale login", async () => {
    vi.resetModules();
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => null,
    }));

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/fr/login?callbackUrl=%2Ffr%2Fadmin%2Foverview",
    );
  });

});
