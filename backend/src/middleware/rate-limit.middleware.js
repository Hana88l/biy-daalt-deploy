const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 20;

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || DEFAULT_WINDOW_MS);
  const maxRequests = Number(options.maxRequests || DEFAULT_MAX_REQUESTS);
  const keyPrefix = options.keyPrefix || "global";
  const getKey = typeof options.key === "function"
    ? options.key
    : (req) => `${keyPrefix}:${getClientIp(req)}`;
  const message = options.message || "Too many requests. Please try again later.";
  const store = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = getKey(req);
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count <= maxRequests) {
      return next();
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: message,
      retryAfterSeconds,
    });
  };
}

module.exports = {
  createRateLimiter,
  getClientIp,
};
