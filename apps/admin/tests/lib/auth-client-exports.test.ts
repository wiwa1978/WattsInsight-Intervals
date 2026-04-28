import { describe, expect, it } from "vitest";

import * as authExports from "../../src/lib/auth-client";

describe("admin auth client exports", () => {
  it("keeps admin auth plugin helpers available", () => {
    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(true);
  });
});
