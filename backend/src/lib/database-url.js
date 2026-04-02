function hasValue(input) {
  return input !== undefined && input !== null && String(input).length > 0;
}

function buildMysqlUrlFromParts(env = process.env) {
  const host = env.MYSQLHOST || env.MYSQL_HOST;
  const port = env.MYSQLPORT || env.MYSQL_PORT || "3306";
  const user = env.MYSQLUSER || env.MYSQL_USER;
  const password = env.MYSQLPASSWORD || env.MYSQL_PASSWORD;
  const database = env.MYSQLDATABASE || env.MYSQL_DATABASE;

  if (!hasValue(host) || !hasValue(user) || !hasValue(password) || !hasValue(database)) {
    return null;
  }

  return `mysql://${encodeURIComponent(String(user))}:${encodeURIComponent(
    String(password)
  )}@${String(host)}:${String(port)}/${encodeURIComponent(String(database))}`;
}

function resolveDatabaseUrl(env = process.env) {
  const databaseUrlFromParts = buildMysqlUrlFromParts(env);
  if (databaseUrlFromParts) {
    return databaseUrlFromParts;
  }

  return env.DATABASE_URL || env.MYSQL_URL || env.MYSQL_PUBLIC_URL || null;
}

module.exports = {
  buildMysqlUrlFromParts,
  resolveDatabaseUrl,
};
