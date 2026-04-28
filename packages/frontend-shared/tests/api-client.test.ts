import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApiRequest, createBearerApiRequest } from "../src/api-client";

describe("frontend shared API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults cookie requests to no-store", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/me/session");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/me/session", expect.objectContaining({
      cache: "no-store",
      credentials: "include",
    }));
  });

  it("allows per-request cache options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/public/countries", { cache: "force-cache" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/public/countries", expect.objectContaining({
      cache: "force-cache",
    }));
  });

  it("adds bearer authorization without cookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createBearerApiRequest({ baseURL: "https://api.example.test", getToken: () => "token-123" });

    await request("/mobile/me");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("keeps bearer requests cookie-free when credentials are provided per request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createBearerApiRequest({ baseURL: "https://api.example.test", getToken: () => "token-123" });

    await request("/mobile/me", { credentials: "include" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
  });
});
