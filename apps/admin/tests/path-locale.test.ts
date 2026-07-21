import { describe, expect, it } from "vitest";

import { getPathLocale, sanitizeInternalRedirectPath } from "../src/i18n/path-locale";

describe("getPathLocale", () => {
  it("parses supported locale from first path segment", () => {
    expect(getPathLocale("/nl/admin/overview")).toEqual({
      activeLocale: "nl",
      pathWithoutLocale: "/admin/overview",
    });
    expect(getPathLocale("/fr/billing")).toEqual({
      activeLocale: "fr",
      pathWithoutLocale: "/billing",
    });
  });

  it("falls back to default locale when path has no supported locale", () => {
    expect(getPathLocale("/admin/overview")).toEqual({
      activeLocale: "en",
      pathWithoutLocale: "/admin/overview",
    });
  });
});

describe("sanitizeInternalRedirectPath", () => {
  it("allows normal internal paths", () => {
    expect(sanitizeInternalRedirectPath("/fr/admin/overview", "/admin/overview")).toBe("/admin/overview");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizeInternalRedirectPath("https://evil.example.com", "/admin/overview")).toBe("/admin/overview");
    expect(sanitizeInternalRedirectPath("//evil.example.com", "/admin/overview")).toBe("/admin/overview");
  });
});
