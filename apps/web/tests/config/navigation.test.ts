import { describe, expect, it } from "vitest";

import { FrontendAuthItems, FrontendNavItems } from "../../src/config/frontend-navbar";
import { BackendNavItems } from "../../src/config/backend-navbar-dashboard";

describe("web navigation config", () => {
  it("keeps unique frontend navigation urls", () => {
    const urls = FrontendNavItems.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("contains expected auth entries", () => {
    expect(FrontendAuthItems.login.url).toBe("/login");
    expect(FrontendAuthItems.signup.url).toBe("/signup");
  });

  it("contains expected dashboard sidebar entries", () => {
    expect(BackendNavItems).toHaveLength(2);
    expect(BackendNavItems).toEqual([
      expect.objectContaining({
        title: "dashboard.nav.overview",
        url: "/dashboard",
      }),
      expect.objectContaining({
        title: "dashboard.nav.billing",
        url: "/billing",
      }),
    ]);
  });
});
