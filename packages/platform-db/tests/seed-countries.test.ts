import { describe, expect, it } from "vitest";

import { seedCountries } from "../src/seed/countries";

describe("seedCountries", () => {
  it("includes Belgium for every supported locale", () => {
    for (const language of ["en", "nl", "fr"] as const) {
      expect(seedCountries).toContainEqual(expect.objectContaining({ code: "BE", language }));
    }
  });

  it("has unique country code and language pairs", () => {
    const keys = seedCountries.map((country) => `${country.code}:${country.language}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
