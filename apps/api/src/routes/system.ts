import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { countriesQuerySchema } from "@platform/contracts/wire";
import { country } from "@platform/platform-db";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { ok, parseQuery, validationError } from "../lib/http";

export function createSystemRouter() {
  const router = new Hono<AppEnv>();

  router.get("/health", (c) => {
    return c.json({ success: true, data: { status: "ok" } });
  });

  router.get("/countries", async (c) => {
    const parsedQuery = parseQuery(countriesQuerySchema, {
      lang: c.req.query("lang"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid countries query");
    }

    const localizedCountries = await bootstrap.db
      .select({
        id: country.id,
        name: country.name,
        code: country.code,
        language: country.language,
      })
      .from(country)
      .where(eq(country.language, parsedQuery.data.lang))
      .orderBy(asc(country.name));

    if (localizedCountries.length > 0) {
      return ok(c, localizedCountries);
    }

    const fallbackCountries = await bootstrap.db
      .select({
        id: country.id,
        name: country.name,
        code: country.code,
        language: country.language,
      })
      .from(country)
      .where(eq(country.language, "en"))
      .orderBy(asc(country.name));

    return ok(c, fallbackCountries);
  });

  return router;
}
