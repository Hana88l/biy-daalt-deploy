require("./runtime-env");

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const { resolveDatabaseUrl } = require("./database-url");

const databaseUrl = resolveDatabaseUrl(process.env);

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL, MYSQL_URL, or Railway MySQL component variables must be set before Prisma starts"
  );
}

const adapter = new PrismaMariaDb(databaseUrl);

const prisma = new PrismaClient({
  adapter,
});

module.exports = prisma;
