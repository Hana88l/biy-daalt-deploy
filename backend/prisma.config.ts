import "dotenv/config";
import { defineConfig } from "prisma/config";
import databaseUrlHelpers from "./src/lib/database-url.js";

const { resolveDatabaseUrl } = databaseUrlHelpers;
const databaseUrl = resolveDatabaseUrl(process.env);

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL, MYSQL_URL, or Railway MySQL component variables must be defined for Prisma."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
