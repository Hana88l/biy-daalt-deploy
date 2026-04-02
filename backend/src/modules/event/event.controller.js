const prisma = require("../../lib/prisma");
const { publishEvent } = require("../../lib/redisPubSub");

function normalizeApiKey(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("dp_live_")) return trimmed;

  // Accept raw UUIDs (with/without hyphens) and map to dp_live_ keys.
  const stripped = trimmed.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(stripped)) {
    return `dp_live_${stripped}`;
  }

  return trimmed;
}

async function trackEvent(req, res) {
  try {
    const apiKey = normalizeApiKey(req.headers["x-api-key"] || req.body.apiKey);
    const { event, userId, properties } = req.body;

    const owner = await prisma.user.findUnique({
      where: { apiKey },
    });

    if (!owner) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const newEvent = await prisma.event.create({
      data: {
        eventName: event,
        userId: userId || null,
        properties: properties || {},
        ownerId: owner.id,
      },
    });

    await publishEvent('live_events', {
      ownerId: owner.id,
      event: {
        id: newEvent.id,
        eventName: newEvent.eventName,
        userId: newEvent.userId,
        properties: newEvent.properties,
        timestamp: newEvent.timestamp,
      },
    });

    res.json({ success: true, message: "Event recorded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
}

module.exports = { trackEvent };
