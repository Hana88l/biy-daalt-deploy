const prisma = require("../../lib/prisma");
const { analyzeConnectedSiteForUser } = require("./analytics.controller");

const DEFAULT_SCAN_INTERVAL_MS = 60000;
const runningUsers = new Set();
let monitorTimer = null;
let monitorTickRunning = false;

function getScanIntervalMs() {
  const configured = Number(process.env.SITE_SCAN_INTERVAL_MS || DEFAULT_SCAN_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_SCAN_INTERVAL_MS;
  return Math.max(configured, 15000);
}

async function runSiteMonitorTick() {
  if (monitorTickRunning) return;
  monitorTickRunning = true;

  try {
    const [sites, legacyUsers] = await Promise.all([
      prisma.connectedSite.findMany({
        where: {
          isEnabled: true,
        },
        select: {
          id: true,
          ownerId: true,
          siteUrl: true,
          isActive: true,
        },
      }),
      prisma.user.findMany({
        where: {
          siteUrl: {
            not: null,
          },
          sites: {
            none: {},
          },
        },
        select: {
          id: true,
          siteUrl: true,
        },
      }),
    ]);

    for (const site of sites) {
      const runKey = `${site.ownerId}:${site.siteUrl}`;
      if (!site.siteUrl || runningUsers.has(runKey)) continue;

      runningUsers.add(runKey);
      try {
        await analyzeConnectedSiteForUser(site.ownerId, site.siteUrl, {
          siteId: site.id,
          setActive: site.isActive,
        });
      } catch (error) {
        console.error(`Automated site monitor failed for user ${site.ownerId} (${site.siteUrl}):`, error.message || error);
      } finally {
        runningUsers.delete(runKey);
      }
    }

    for (const user of legacyUsers) {
      const runKey = `${user.id}:${user.siteUrl}`;
      if (!user.siteUrl || runningUsers.has(runKey)) continue;

      runningUsers.add(runKey);
      try {
        await analyzeConnectedSiteForUser(user.id, user.siteUrl, {
          setActive: true,
        });
      } catch (error) {
        console.error(`Automated site monitor failed for legacy user ${user.id}:`, error.message || error);
      } finally {
        runningUsers.delete(runKey);
      }
    }
  } catch (error) {
    console.error("Automated site monitor tick failed:", error);
  } finally {
    monitorTickRunning = false;
  }
}

function startSiteMonitor() {
  if (monitorTimer) return;

  const intervalMs = getScanIntervalMs();
  monitorTimer = setInterval(runSiteMonitorTick, intervalMs);

  // Kick off an initial pass shortly after boot so connected sites start updating automatically.
  setTimeout(() => {
    runSiteMonitorTick().catch(() => {});
  }, 5000);

  console.log(`Automated site monitor enabled. Interval: ${intervalMs}ms`);
}

module.exports = {
  startSiteMonitor,
  runSiteMonitorTick,
};
