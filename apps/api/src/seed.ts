import "dotenv/config";

import { and, eq, or } from "drizzle-orm";

import { country, createPlatformDb, seedCountries } from "@platform/platform-db";

import { env } from "./env";

const { db, sql: client } = createPlatformDb({ connectionString: env.DATABASE_URL });

async function seedCountryData() {
  await db.delete(country).where(or(
    ...seedCountries.map((entry) => and(eq(country.code, entry.code), eq(country.language, entry.language))),
  ));

  await db
    .insert(country)
    .values([...seedCountries]);

  console.log(`Upserted ${seedCountries.length} country translations`);
}

try {
  await seedCountryData();
} finally {
  await client.end();
}
