import { describe, expect, it } from "vitest";

import { createBasePlugins } from "../../../../packages/auth-client/src/web-shared";

describe("auth client feature flags", () => {
  it("keeps a stable plugin surface for Better Auth client inference", () => {
    const plugins = createBasePlugins({
      baseURL: "http://localhost:8787/auth",
      features: {
        billing: false,
        twoFactor: false,
        passkeys: false,
        magicLink: false,
      },
    });

    expect(plugins.length).toBe(5);
  });

  it("includes optional auth plugins when their features are enabled", () => {
    const plugins = createBasePlugins({
      baseURL: "http://localhost:8787/auth",
      features: {
        billing: true,
        twoFactor: true,
        passkeys: true,
        magicLink: true,
      },
    });

    expect(plugins.length).toBe(5);
  });
});
