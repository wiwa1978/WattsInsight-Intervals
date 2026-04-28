import { describe, expect, it } from "vitest";

import * as authExports from "../../src/lib/auth-client";

describe("web auth client exports", () => {
  it("does not expose admin auth plugin helpers", () => {
    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(false);
  });
});
