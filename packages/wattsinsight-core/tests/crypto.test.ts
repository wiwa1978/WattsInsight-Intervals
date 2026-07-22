import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "../src/crypto";

describe("token encryption", () => {
  it("encrypts tokens without preserving plaintext", () => {
    const key = "0".repeat(32);
    const encrypted = encryptToken("access-token-123", key);

    expect(encrypted).not.toContain("access-token-123");
    expect(decryptToken(encrypted, key)).toBe("access-token-123");
  });
});
