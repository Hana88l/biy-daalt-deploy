const prisma = require("../../lib/prisma");

const CONNECTED_SITE_SELECT = {
  id: true,
  siteUrl: true,
  siteName: true,
  lastAnalyzedAt: true,
  isActive: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
};

const USER_SITE_STATE_SELECT = {
  id: true,
  email: true,
  apiKey: true,
  siteUrl: true,
  siteName: true,
  lastAnalyzedAt: true,
  aiEnabled: true,
  aiProvider: true,
  aiBaseUrl: true,
  aiModel: true,
  aiApiKeyCiphertext: true,
  aiSystemPrompt: true,
  createdAt: true,
  sites: {
    select: CONNECTED_SITE_SELECT,
  },
};

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sameValue(left, right) {
  return (left ?? null) === (right ?? null);
}

function sameDate(left, right) {
  return toIsoString(left) === toIsoString(right);
}

function sortSites(sites = []) {
  return [...sites].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if (left.isEnabled !== right.isEnabled) return left.isEnabled ? -1 : 1;

    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function serializeConnectedSite(site) {
  if (!site) return null;

  return {
    id: site.id,
    url: site.siteUrl,
    name: site.siteName || null,
    lastAnalyzedAt: site.lastAnalyzedAt || null,
    isActive: Boolean(site.isActive),
    isEnabled: site.isEnabled !== false,
    createdAt: site.createdAt || null,
    updatedAt: site.updatedAt || null,
  };
}

async function getUserRecord(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: USER_SITE_STATE_SELECT,
  });
}

async function syncUserActiveSiteCache(userId, activeSite) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      siteUrl: activeSite?.siteUrl || null,
      siteName: activeSite?.siteName || null,
      lastAnalyzedAt: activeSite?.lastAnalyzedAt || null,
    },
  });
}

function hasMatchingLegacyCache(user, activeSite) {
  return (
    sameValue(user?.siteUrl, activeSite?.siteUrl || null) &&
    sameValue(user?.siteName, activeSite?.siteName || null) &&
    sameDate(user?.lastAnalyzedAt, activeSite?.lastAnalyzedAt || null)
  );
}

async function ensureUserSiteState(userId, options = {}) {
  const bootstrapLegacy = options.bootstrapLegacy !== false;
  let user = await getUserRecord(userId);
  if (!user) return null;

  let needsRefresh = false;

  if (bootstrapLegacy && user.siteUrl && user.sites.length === 0) {
    await prisma.connectedSite.create({
      data: {
        ownerId: user.id,
        siteUrl: user.siteUrl,
        siteName: user.siteName || null,
        lastAnalyzedAt: user.lastAnalyzedAt || null,
        isActive: true,
        isEnabled: true,
      },
    });

    await prisma.connectedSite.updateMany({
      where: {
        ownerId: user.id,
        siteUrl: { not: user.siteUrl },
        isActive: true,
      },
      data: { isActive: false },
    });

    needsRefresh = true;
  }

  if (needsRefresh) {
    user = await getUserRecord(userId);
  }

  const disabledActiveIds = user.sites.filter((site) => site.isActive && !site.isEnabled).map((site) => site.id);
  if (disabledActiveIds.length > 0) {
    await prisma.connectedSite.updateMany({
      where: {
        ownerId: user.id,
        id: { in: disabledActiveIds },
      },
      data: { isActive: false },
    });
    user = await getUserRecord(userId);
  }

  let orderedSites = sortSites(user.sites);
  let activeSites = orderedSites.filter((site) => site.isActive && site.isEnabled);

  if (activeSites.length > 1) {
    const [primary, ...duplicates] = activeSites;
    await prisma.connectedSite.updateMany({
      where: {
        ownerId: user.id,
        id: { in: duplicates.map((site) => site.id) },
      },
      data: { isActive: false },
    });
    user = await getUserRecord(userId);
    orderedSites = sortSites(user.sites);
    activeSites = orderedSites.filter((site) => site.isActive && site.isEnabled);
  }

  let activeSite = activeSites[0] || null;

  if (!activeSite) {
    const fallbackSite = orderedSites.find((site) => site.isEnabled) || null;

    if (fallbackSite) {
      await prisma.connectedSite.updateMany({
        where: { ownerId: user.id },
        data: { isActive: false },
      });

      await prisma.connectedSite.update({
        where: { id: fallbackSite.id },
        data: { isActive: true },
      });

      user = await getUserRecord(userId);
      orderedSites = sortSites(user.sites);
      activeSite = orderedSites.find((site) => site.isActive && site.isEnabled) || null;
    }
  }

  if (!hasMatchingLegacyCache(user, activeSite)) {
    await syncUserActiveSiteCache(user.id, activeSite);
    user = await getUserRecord(userId);
    orderedSites = sortSites(user.sites);
    activeSite = orderedSites.find((site) => site.isActive && site.isEnabled) || null;
  }

  return {
    user,
    activeSite: serializeConnectedSite(activeSite),
    sites: orderedSites.map(serializeConnectedSite),
  };
}

async function upsertSiteAfterAnalysis(userId, input) {
  const siteUrl = String(input?.siteUrl || "").trim();
  if (!siteUrl) {
    throw new Error("Site URL is required");
  }

  await ensureUserSiteState(userId);

  const siteName = input?.siteName || null;
  const lastAnalyzedAt = input?.lastAnalyzedAt || null;
  const setActive = input?.setActive !== false;
  const requestedSiteId = Number(input?.siteId || 0) || null;

  const existingByUrl = await prisma.connectedSite.findFirst({
    where: {
      ownerId: userId,
      siteUrl,
    },
    select: CONNECTED_SITE_SELECT,
  });

  let targetSiteId = existingByUrl?.id || null;

  if (requestedSiteId) {
    const requestedSite = await prisma.connectedSite.findFirst({
      where: {
        id: requestedSiteId,
        ownerId: userId,
      },
      select: CONNECTED_SITE_SELECT,
    });

    if (requestedSite) {
      targetSiteId = requestedSite.id;

      if (existingByUrl && existingByUrl.id !== requestedSite.id) {
        await prisma.connectedSite.delete({
          where: { id: requestedSite.id },
        });
        targetSiteId = existingByUrl.id;
      }
    }
  }

  if (setActive) {
    await prisma.connectedSite.updateMany({
      where: { ownerId: userId },
      data: { isActive: false },
    });
  }

  if (targetSiteId) {
    await prisma.connectedSite.update({
      where: { id: targetSiteId },
      data: {
        siteUrl,
        siteName,
        lastAnalyzedAt,
        isEnabled: true,
        ...(setActive ? { isActive: true } : {}),
      },
    });
  } else {
    await prisma.connectedSite.create({
      data: {
        ownerId: userId,
        siteUrl,
        siteName,
        lastAnalyzedAt,
        isEnabled: true,
        isActive: setActive,
      },
    });
  }

  return ensureUserSiteState(userId);
}

async function activateSite(userId, siteId) {
  const numericSiteId = Number(siteId);
  if (!Number.isFinite(numericSiteId)) return null;

  const site = await prisma.connectedSite.findFirst({
    where: {
      id: numericSiteId,
      ownerId: userId,
    },
    select: CONNECTED_SITE_SELECT,
  });

  if (!site) return null;

  await prisma.connectedSite.updateMany({
    where: { ownerId: userId },
    data: { isActive: false },
  });

  await prisma.connectedSite.update({
    where: { id: numericSiteId },
    data: {
      isActive: true,
      isEnabled: true,
    },
  });

  return ensureUserSiteState(userId);
}

async function deactivateSite(userId, siteId) {
  const numericSiteId = Number(siteId);
  if (!Number.isFinite(numericSiteId)) return null;

  const site = await prisma.connectedSite.findFirst({
    where: {
      id: numericSiteId,
      ownerId: userId,
    },
    select: CONNECTED_SITE_SELECT,
  });

  if (!site) return null;

  await prisma.connectedSite.update({
    where: { id: numericSiteId },
    data: {
      isActive: false,
      isEnabled: false,
    },
  });

  return {
    site: serializeConnectedSite(site),
    ...(await ensureUserSiteState(userId, { bootstrapLegacy: false })),
  };
}

async function deleteSite(userId, siteId) {
  const numericSiteId = Number(siteId);
  if (!Number.isFinite(numericSiteId)) return null;

  const site = await prisma.connectedSite.findFirst({
    where: {
      id: numericSiteId,
      ownerId: userId,
    },
    select: CONNECTED_SITE_SELECT,
  });

  if (!site) return null;

  await prisma.connectedSite.delete({
    where: { id: numericSiteId },
  });

  return {
    site: serializeConnectedSite(site),
    ...(await ensureUserSiteState(userId, { bootstrapLegacy: false })),
  };
}

module.exports = {
  ensureUserSiteState,
  serializeConnectedSite,
  upsertSiteAfterAnalysis,
  activateSite,
  deactivateSite,
  deleteSite,
};
