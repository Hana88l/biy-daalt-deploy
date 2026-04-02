require("./lib/runtime-env");
const { connectPubSub } = require("./lib/redisPubSub");
const { startEventWorker } = require("./lib/event-worker");

// Connect PubSub immediately
connectPubSub().catch(console.error);

console.log("Worker starting up...");
startEventWorker({ label: "worker" });
