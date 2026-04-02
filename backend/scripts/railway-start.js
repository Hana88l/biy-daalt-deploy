require("../src/lib/runtime-env");
const path = require("path");
const { spawn } = require("child_process");
const { resolveDatabaseUrl } = require("../src/lib/database-url");

const BUILD_PLACEHOLDER_DATABASE_URL =
  "mysql://root:password@127.0.0.1:3306/quantum_stars_build";
const MIGRATION_ATTEMPTS = Math.max(1, Number(process.env.PRISMA_MIGRATION_ATTEMPTS || 12));
const MIGRATION_RETRY_DELAY_MS = Math.max(
  1000,
  Number(process.env.PRISMA_MIGRATION_RETRY_DELAY_MS || 5000)
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });
    let combinedOutput = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const error = new Error(`${command} ${args.join(" ")} exited with code ${code}`);
      error.output = combinedOutput;
      return reject(error);
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

  for (let attempt = 1; attempt <= MIGRATION_ATTEMPTS; attempt += 1) {
    try {
      await runCommand(process.execPath, [prismaCliPath, "migrate", "deploy"], backendRoot);
      break;
    } catch (error) {
      const output = String(error.output || "");
      const isReachabilityError = output.includes("P1001");
      const isLastAttempt = attempt === MIGRATION_ATTEMPTS;

      if (!isReachabilityError || isLastAttempt) {
        if (isReachabilityError) {
          error.message =
            `${error.message}\nMySQL stayed unreachable after ${attempt} attempts. ` +
            "On Railway, make sure the app and MySQL services are in the same project environment and the MySQL service is healthy.";
        }
        throw error;
      }

      console.log(
        `MySQL is not reachable yet (attempt ${attempt}/${MIGRATION_ATTEMPTS}). ` +
          `Retrying in ${Math.round(MIGRATION_RETRY_DELAY_MS / 1000)}s...`
      );
      await sleep(MIGRATION_RETRY_DELAY_MS);
    }
  }

  console.log("Launching API server...");
  require("../src/index");
}

main().catch((error) => {
  console.error("Railway startup failed:", error);
  process.exit(1);
});
