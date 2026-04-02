require("../src/lib/runtime-env");
const path = require("path");
const { spawn } = require("child_process");
const { resolveDatabaseUrl } = require("../src/lib/database-url");

const BUILD_PLACEHOLDER_DATABASE_URL =
  "mysql://root:password@127.0.0.1:3306/quantum_stars_build";

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      return reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  const backendRoot = path.resolve(__dirname, "..");
  const prismaCliPath = require.resolve("prisma/build/index.js", {
    paths: [backendRoot],
  });
  const runtimeDatabaseUrl = resolveDatabaseUrl(process.env);

  if (!runtimeDatabaseUrl) {
    throw new Error(
      "Database connection variables are missing. On Railway, either set DATABASE_URL or map MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, and MYSQLDATABASE from your MySQL service."
    );
  }

  if (runtimeDatabaseUrl === BUILD_PLACEHOLDER_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is still set to the Docker build placeholder value. In Railway, map MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, and MYSQLDATABASE from your MySQL service."
    );
  }

  if (/127\.0\.0\.1|localhost/i.test(runtimeDatabaseUrl)) {
    throw new Error(
      "The resolved database URL points to localhost. On Railway, map MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, and MYSQLDATABASE from your MySQL service instead."
    );
  }

  console.log("Starting Railway production boot sequence...");
  console.log("Applying Prisma migrations...");
  await runCommand(process.execPath, [prismaCliPath, "migrate", "deploy"], backendRoot);

  console.log("Launching API server...");
  require("../src/index");
}

main().catch((error) => {
  console.error("Railway startup failed:", error);
  process.exit(1);
});
