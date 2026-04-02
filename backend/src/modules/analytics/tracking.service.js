const prisma = require("../../lib/prisma");
const { eventQueue } = require("../../lib/queue");
const { publishEvent } = require("../../lib/redisPubSub");
const { matchesSiteHost } = require("./tracking.utils");

const TRACKING_CONTEXT_TTL_MS = Number(process.env.TRACKING_CONTEXT_TTL_MS || 10000);
const TRACKING_QUEUE_NAME = "track-event";
const trackingContextCache = new Map();

function setTrackingContext(apiKey, value) {
  trackingContextCache.set(apiKey, {
    expiresAt: Date.now() + TRACKING_CONTEXT_TTL_MS,
    value,
  });
}

function getCachedTrackingContext(apiKey) {
  const cached = trackingContextCache.get(apiKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    trackingContextCache.delete(apiKey);
    return null;
  }

  return cached.value;
}

async function loadTrackingContext(apiKey) {
  const cached = getCachedTrackingContext(apiKey);
  if (cached) return cached;

  const owner = await prisma.user.findUnique({
    where: { apiKey },
    select: {
      id: true,
      siteUrl: true,
      sites: {
        where: { isEnabled: true },
        select: { siteUrl: true },
      },
    },
  });

  if (!owner) return null;

  const allowedSiteUrls = owner.sites.length > 0
    ? owner.sites.map((site) => site.siteUrl)
    : owner.siteUrl
      ? [owner.siteUrl]
      : [];

  const context = {
    ownerId: owner.id,
    allowedSiteUrls,
  };

  setTrackingContext(apiKey, context);
  return context;
}

async function resolveTrackingOwner(apiKey, host) {
  const context = await loadTrackingContext(apiKey);
  if (!context) return { ok: false, status: 401, error: "Invalid API Key" };

  if (
    host &&
    context.allowedSiteUrls.length > 0 &&
    !context.allowedSiteUrls.some((siteUrl) => matchesSiteHost(siteUrl, host))
  ) {
    return { ok: false, status: 403, error: "Domain is inactive or not connected" };
  }

  return {
    ok: true,
    ownerId: context.ownerId,
  };
}

function buildRealtimePayload(eventRecord) {
  return {
    id: eventRecord.id,
    eventName: eventRecord.eventName,
    userId: eventRecord.userId,
    properties: eventRecord.properties,
    timestamp: eventRecord.timestamp,
  };
}

async function persistTrackedEvent(jobData) {
  const eventRecord = await prisma.event.create({
    data: {
      ownerId: jobData.ownerId,
      eventName: jobData.eventName,
      userId: jobData.userId || null,
      properties: jobData.properties || {},
    },
  });

  await publishEvent("live_events", {
    ownerId: jobData.ownerId,
    event: buildRealtimePayload(eventRecord),
  });

  return eventRecord;
}

async function enqueueTrackedEvent(jobData) {
  try {
    const job = await eventQueue.add(TRACKING_QUEUE_NAME, jobData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 500,
      },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });

    return {
      queued: true,
      jobId: job.id,
    };
  } catch (error) {
    const eventRecord = await persistTrackedEvent(jobData);
    return {
      queued: false,
      fallback: true,
      eventId: eventRecord.id,
    };
  }
}

module.exports = {
  enqueueTrackedEvent,
  persistTrackedEvent,
  resolveTrackingOwner,
};
