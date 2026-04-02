const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

function setDefaultEnv(key, value) {
  if (!process.env[key] && value) {
    process.env[key] = value;
  }
}

setDefaultEnv("DATABASE_URL", process.env.MYSQL_URL);

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const publicOrigin = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  setDefaultEnv("APP_ORIGIN", publicOrigin);
  setDefaultEnv("FRONTEND_URL", publicOrigin);
}

module.exports = {
  setDefaultEnv,
};
