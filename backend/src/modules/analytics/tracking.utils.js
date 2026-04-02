const DEFAULT_EVENT_NAME = "page_view";
const MAX_EVENT_NAME_LENGTH = 80;
const MAX_USER_ID_LENGTH = 128;
const MAX_PROPERTY_DEPTH = 4;
const MAX_PROPERTY_KEYS = 40;
const MAX_ARRAY_ITEMS = 40;
const MAX_STRING_LENGTH = 1024;
const MAX_PROPERTIES_BYTES = 12 * 1024;

function normalizeApiKey(raw) {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("dp_live_")) return trimmed;

  const stripped = trimmed.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(stripped)) {
    return `dp_live_${stripped}`;
  }

  return trimmed;
}

function getSiteHostAliases(siteUrl) {
  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    if (!hostname) return [];

    const aliases = new Set([hostname]);
    if (hostname.startsWith("www.")) aliases.add(hostname.slice(4));
    else aliases.add(`www.${hostname}`);

    return Array.from(aliases);
  } catch {
    return [];
  }
}

function matchesSiteHost(siteUrl, eventHost) {
  const aliases = getSiteHostAliases(siteUrl);
  if (aliases.length === 0) return true;

  const normalizedHost = String(eventHost || "").trim().toLowerCase();
  if (!normalizedHost) return true;

  return aliases.includes(normalizedHost);
}

function truncateString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value).slice(0, maxLength);
}

function sanitizeProperties(value, depth = 0) {
  if (value === null) return null;
  if (value === undefined) return undefined;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return truncateString(value.toString());

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (depth >= MAX_PROPERTY_DEPTH) {
    return truncateString(JSON.stringify(value));
  }

  if (Array.isArray(value)) {
    const items = [];
    for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
      const sanitized = sanitizeProperties(item, depth + 1);
      if (sanitized !== undefined) items.push(sanitized);
    }
    return items;
  }

  if (typeof value === "object") {
    const output = {};
    const entries = Object.entries(value).slice(0, MAX_PROPERTY_KEYS);

    for (const [key, item] of entries) {
      const sanitized = sanitizeProperties(item, depth + 1);
      if (sanitized !== undefined) {
        output[truncateString(key, 64)] = sanitized;
      }
    }

    return output;
  }

  return truncateString(value);
}

function normalizeEventName(raw) {
  const candidate = String(raw || DEFAULT_EVENT_NAME).trim().toLowerCase();
  if (!candidate) return DEFAULT_EVENT_NAME;

  const normalized = candidate.replace(/[^a-z0-9:_-]+/g, "_").slice(0, MAX_EVENT_NAME_LENGTH);
  return normalized || DEFAULT_EVENT_NAME;
}

function normalizeUserId(raw) {
  const trimmed = String(raw || "").trim();
  return trimmed ? trimmed.slice(0, MAX_USER_ID_LENGTH) : null;
}

function normalizeTrackPayload(body = {}) {
  const rawProperties = body?.properties;
  const properties = rawProperties && typeof rawProperties === "object" && !Array.isArray(rawProperties)
    ? sanitizeProperties(rawProperties)
    : {};

  const serialized = JSON.stringify(properties || {});
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROPERTIES_BYTES) {
    const error = new Error("Event payload is too large");
    error.status = 413;
    throw error;
  }

  return {
    eventName: normalizeEventName(body?.eventName || body?.event),
    userId: normalizeUserId(body?.userId),
    properties: properties || {},
  };
}

module.exports = {
  DEFAULT_EVENT_NAME,
  MAX_PROPERTIES_BYTES,
  matchesSiteHost,
  normalizeApiKey,
  normalizeTrackPayload,
};
