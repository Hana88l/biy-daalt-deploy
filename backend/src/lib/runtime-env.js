const path = require("path");
const dotenv = require("dotenv");
const { resolveDatabaseUrl } = require("./database-url");

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

function setDefaultEnv(key, value) {
  if (!process.env[key] && value) {
    process.env[key] = value;
  }
}

const resolvedDatabaseUrl = resolveDatabaseUrl(process.env);
if (resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const publicOrigin = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  setDefaultEnv("APP_ORIGIN", publicOrigin);
  setDefaultEnv("FRONTEND_URL", publicOrigin);
}

module.exports = {
  setDefaultEnv,
};
