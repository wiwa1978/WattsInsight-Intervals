import { describe, expect, it } from "vitest";

import { toSerializable } from "../src/client-logger";

describe("client logger redaction", () => {
  it("redacts sensitive object keys recursively", () => {
    expect(toSerializable({ token: "secret", nested: { authorization: "Bearer abc", email: "user@example.com" } })).toEqual({
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        email: "[REDACTED]",
      },
    });
  });

  it("redacts sensitive query parameters in URLs", () => {
    expect(toSerializable("https://app.example/reset-password?token=abc&code=123&ok=true")).toBe("https://app.example/reset-password?token=%5BREDACTED%5D&code=%5BREDACTED%5D&ok=true");
  });

  it("bounds large serialized objects", () => {
    const serialized = toSerializable({
      error: {
        message: "x".repeat(10_000),
        stack: "y".repeat(10_000),
      },
      context: Array.from({ length: 100 }, (_, index) => ({ index, value: "z".repeat(200) })),
    });

    expect(JSON.stringify(serialized).length).toBeLessThan(3500);
  });
});
