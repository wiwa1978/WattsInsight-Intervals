import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (process.env.DRIZZLE_REQUIRE_DATABASE_URL === "1" && !databaseUrl) {
  throw new Error("DATABASE_URL is required for database migration commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/platform-db/src/schema/index.ts",
  out: "./packages/platform-db/drizzle",
  dbCredentials: {
    url: databaseUrl ?? "postgres://postgres:postgres@localhost:5432/platform",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
