const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('Redis Pub Client Error', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error', err));

async function connectPubSub() {
  await Promise.all([pubClient.connect(), subClient.connect()]);
  console.log('Redis Pub/Sub clients connected.');
}

async function publishEvent(channel, messageObj) {
  try {
    await pubClient.publish(channel, JSON.stringify(messageObj));
  } catch (err) {
    console.error('Failed to publish message:', err);
  }
}

module.exports = {
  pubClient,
  subClient,
  connectPubSub,
  publishEvent,
};
