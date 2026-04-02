require("./lib/runtime-env");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { collectEvent } = require("./modules/analytics/analytics.controller");
const { connectPubSub } = require("./lib/redisPubSub");
const { startEventWorker } = require("./lib/event-worker");
const { initRealtimeSub } = require("./modules/realtime/realtime.controller");
const { startSiteMonitor } = require("./modules/analytics/site-monitor.service");

const authRouter = require("./modules/auth/auth.routes");
const realtimeRouter = require("./modules/realtime/realtime.routes");
const analyticsRouter = require("./modules/analytics/analytics.routes");
const aiRouter = require("./modules/ai/ai.routes");

const app = express();
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "64kb";
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");
const builtTrackerPath = path.join(frontendDistPath, "tracker.js");
const publicTrackerPath = path.resolve(__dirname, "../../frontend/public/tracker.js");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

app.disable("x-powered-by");

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    credentials: true,
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

connectPubSub()
  .then(() => {
    initRealtimeSub();
    startSiteMonitor();
    if (process.env.ENABLE_INLINE_EVENT_WORKER !== "false") {
      startEventWorker({ label: "api" });
    }
    console.log("Realtime listeners initialized");
  })
  .catch((err) => {
    console.error("Redis PubSub connection failed:", err);
  });

app.use("/api/auth", authRouter);
app.use("/api/realtime", realtimeRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/ai", aiRouter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "quantum-stars",
    frontend: hasFrontendBuild ? "embedded" : "missing",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  if (hasFrontendBuild) {
    return res.sendFile(frontendIndexPath);
  }

  return res.send("Analytics SaaS API running");
});

app.post("/track", collectEvent);

app.get("/tracker.js", (req, res) => {
  try {
    const trackerPath = fs.existsSync(builtTrackerPath) ? builtTrackerPath : publicTrackerPath;
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(trackerPath);
  } catch (err) {
    res.status(404).send("Tracker script not found");
  }
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath, { index: false }));

  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path === "/track" || req.path === "/tracker.js" || req.path === "/health") return next();

    return res.sendFile(frontendIndexPath);
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log("-----------------------------------------");
  console.log(`Server running on port ${PORT}`);
  console.log("-----------------------------------------");
});
