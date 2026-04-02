import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
const fallbackDatabaseUrl =
  "mysql://root:password@127.0.0.1:3306/quantum_stars_build";
const prismaArgs = process.argv.slice(2);
const isGenerateCommand = prismaArgs.includes("generate");

if (!databaseUrl && !isGenerateCommand) {
  throw new Error(
    "DATABASE_URL or MYSQL_URL must be defined for Prisma commands outside `prisma generate`."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` does not need a live database, but Docker builds may
    // not inject DATABASE_URL until runtime. Use a syntactically valid fallback
    // only for `prisma generate`; all runtime/migration commands must provide a
    // real DATABASE_URL or MYSQL_URL.
    url: databaseUrl || fallbackDatabaseUrl,
  },
});
