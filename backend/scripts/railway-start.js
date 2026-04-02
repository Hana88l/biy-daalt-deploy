require("../src/lib/runtime-env");
const path = require("path");
const { spawn } = require("child_process");

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
