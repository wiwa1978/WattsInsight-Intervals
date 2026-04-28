import { describe, expect, it } from "vitest";

import { getPathLocale } from "../src/i18n/path-locale";

describe("getPathLocale", () => {
  it("parses supported locale from first path segment", () => {
    expect(getPathLocale("/nl/dashboard")).toEqual({
      activeLocale: "nl",
      pathWithoutLocale: "/dashboard",
    });
    expect(getPathLocale("/fr/billing/history")).toEqual({
      activeLocale: "fr",
      pathWithoutLocale: "/billing/history",
    });
  });

  it("falls back to default locale when path has no supported locale", () => {
    expect(getPathLocale("/dashboard")).toEqual({
      activeLocale: "en",
      pathWithoutLocale: "/dashboard",
    });
  });
});
