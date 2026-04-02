const { Worker } = require("bullmq");
const { connection } = require("./queue");
const { persistTrackedEvent } = require("../modules/analytics/tracking.service");

let activeWorker = null;

function startEventWorker(options = {}) {
  if (activeWorker) return activeWorker;

  const label = options.label || "events";
  const concurrency = Math.max(1, Number(process.env.EVENT_WORKER_CONCURRENCY || 25));

  activeWorker = new Worker(
    "events",
    async (job) => {
      await persistTrackedEvent(job.data);
    },
    {
      connection,
      concurrency,
    }
  );

  activeWorker.on("ready", () => {
    console.log(`[${label}] BullMQ worker ready with concurrency ${concurrency}`);
  });

  activeWorker.on("failed", (job, error) => {
    console.error(`[${label}] Event job ${job?.id || "unknown"} failed:`, error);
  });

  activeWorker.on("error", (error) => {
    console.error(`[${label}] Event worker error:`, error);
  });

  return activeWorker;
}

module.exports = {
  startEventWorker,
};
