import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
const fallbackDatabaseUrl =
  "mysql://root:password@127.0.0.1:3306/quantum_stars_build";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` does not need a live database, but Railway build may
    // not inject DATABASE_URL until runtime. Use a syntactically valid fallback
    // so Docker image builds can complete, while runtime still requires a real
    // database URL in src/lib/prisma.js.
    url: databaseUrl || fallbackDatabaseUrl,
  },
});
