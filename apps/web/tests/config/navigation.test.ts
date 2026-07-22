import { describe, expect, it } from "vitest";

import { FrontendAuthItems, FrontendNavItems } from "../../src/config/frontend-navbar";
import { BackendNavItems, getBackendNavItems, getUserDropdownNavItems } from "../../src/config/backend-navbar-dashboard";

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
    expect(BackendNavItems).toHaveLength(3);
    expect(BackendNavItems).toEqual([
      expect.objectContaining({
        title: "dashboard.nav.overview",
        url: "/dashboard",
      }),
      expect.objectContaining({
        title: "wattsinsight.nav.connections",
        url: "/wattsinsight/connections",
      }),
      expect.objectContaining({
        title: "wattsinsight.nav.calendar",
        url: "/wattsinsight/calendar",
      }),
    ]);
  });

  it("hides billing navigation when no billing surfaces are enabled", () => {
    expect(getBackendNavItems({
      billing: { enabled: true, mode: "credits", creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toEqual([
      expect.objectContaining({ url: "/dashboard" }),
      expect.objectContaining({ url: "/wattsinsight/connections" }),
      expect.objectContaining({ url: "/wattsinsight/calendar" }),
    ]);
  });

  it("hides billing navigation when billing is disabled", () => {
    expect(getBackendNavItems({
      billing: { enabled: false, mode: "credits", creditSurfacesEnabled: true, subscriptionSurfacesEnabled: true },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toEqual([
      expect.objectContaining({ url: "/dashboard" }),
      expect.objectContaining({ url: "/wattsinsight/connections" }),
      expect.objectContaining({ url: "/wattsinsight/calendar" }),
    ]);
  });

  it("does not show billing navigation while application config is loading", () => {
    expect(getBackendNavItems(undefined)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
    expect(getUserDropdownNavItems(undefined)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
  });

  it("keeps billing portal out of the primary sidebar even when billing surfaces are enabled", () => {
    expect(getBackendNavItems({
      billing: { enabled: true, mode: "credits", creditSurfacesEnabled: true, subscriptionSurfacesEnabled: false },
      features: { vouchers: true, discounts: true, notifications: true },
    })).not.toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
    expect(getBackendNavItems({
      billing: { enabled: true, mode: "subscriptions", creditSurfacesEnabled: false, subscriptionSurfacesEnabled: true },
      features: { vouchers: true, discounts: true, notifications: true },
    })).not.toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
  });

  it("uses the same billing gate for user dropdown navigation", () => {
    expect(getUserDropdownNavItems({
      billing: { enabled: true, mode: "credits", creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toEqual([
      expect.objectContaining({ url: "/settings" }),
    ]);

    expect(getUserDropdownNavItems({
      billing: { enabled: true, mode: "credits", creditSurfacesEnabled: true, subscriptionSurfacesEnabled: false },
      features: { vouchers: true, discounts: true, notifications: true },
    })).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
  });
});
