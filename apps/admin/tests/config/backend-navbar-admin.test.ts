import { describe, expect, it } from "vitest";

import { BackendNavAdminItems, getBackendNavAdminItems } from "../../src/config/backend-navbar-admin";

describe("admin backend nav config", () => {
  it("keeps expected order and unique urls", () => {
    const urls = BackendNavAdminItems.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toEqual([
      "/admin/overview",
      "/admin/system",
      "/admin/admins",
      "/admin/users",
      "/admin/billing",
      "/admin/webhooks",
      "/admin/operations",
      "/admin/notifications",
      "/admin/logs",
    ]);
  });

  it("hides billing navigation when admin billing is not visible", () => {
    expect(getBackendNavAdminItems({
      billing: { enabled: false, mode: "credits", creditSurfacesEnabled: true, subscriptionSurfacesEnabled: true },
      features: { vouchers: true, discounts: true, notifications: true },
    }).map((item) => item.url)).toEqual([
      "/admin/overview",
      "/admin/system",
      "/admin/admins",
      "/admin/users",
      "/admin/webhooks",
      "/admin/operations",
      "/admin/notifications",
      "/admin/logs",
    ]);
  });

  it("keeps billing navigation while application config is loading", () => {
    expect(getBackendNavAdminItems(undefined)).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/admin/billing" })]),
    );
  });
});
