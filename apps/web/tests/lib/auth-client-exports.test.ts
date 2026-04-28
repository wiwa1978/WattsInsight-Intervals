import { describe, expect, it } from "vitest";

describe("web auth client exports", () => {
  it("does not expose admin auth plugin helpers", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_NAME = "Test App";

    const authExports = await import("../../src/lib/auth-client");

    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(false);
  });
});
