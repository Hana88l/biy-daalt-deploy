const { Queue } = require('bullmq');

function getRedisConnection() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    const db = Number(url.pathname?.replace("/", "") || 0);

    return {
      host: url.hostname || "127.0.0.1",
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number.isFinite(db) ? db : 0,
    };
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
  };
}

const connection = getRedisConnection();
const eventQueue = new Queue('events', { connection });

module.exports = {
  eventQueue,
  connection,
};
