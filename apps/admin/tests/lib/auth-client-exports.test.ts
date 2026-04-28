import { describe, expect, it } from "vitest";

describe("admin auth client exports", () => {
  it("keeps admin auth plugin helpers available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
    process.env.NEXT_PUBLIC_APP_NAME = "Test Admin";

    const authExports = await import("../../src/lib/auth-client");

    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(true);
  });
});
