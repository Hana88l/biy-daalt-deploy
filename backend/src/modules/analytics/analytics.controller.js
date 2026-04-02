const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const XLSX = require("xlsx");
const prisma = require("../../lib/prisma");
const { isAdminEmail } = require("../../lib/admin");
const { publishEvent } = require("../../lib/redisPubSub");
const {
  ensureUserSiteState,
  upsertSiteAfterAnalysis,
  activateSite,
  deactivateSite,
  deleteSite,
} = require("./site-registry.service");
const { enqueueTrackedEvent, resolveTrackingOwner } = require("./tracking.service");
const { normalizeApiKey, normalizeTrackPayload } = require("./tracking.utils");

const SITE_SCAN_SOURCE = "site_scan";
const SITE_SCAN_PAGE_LIMIT = 6;
const SITE_SCAN_TIMEOUT_MS = 10000;
const SITE_SCAN_USER_PREFIX = "site:";
const NON_HTML_FILE_PATTERN = /\.(?:css|js|mjs|json|xml|txt|pdf|jpg|jpeg|png|gif|svg|webp|ico|mp4|mp3|woff2?|ttf|eot)$/i;

function getStartDate(range) {
  const now = new Date();

  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

function getRealtimeStartDate(minutes = 5) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function getOwnerContext(req) {
  const isAdmin = isAdminEmail(req.user.email);
  const currentUserId = req.user.id || req.user.userId || 0;

  return {
    isAdmin,
    currentUserId,
  };
}

function getOwnerFilter(req) {
  const { isAdmin, currentUserId } = getOwnerContext(req);
  return isAdmin ? {} : { ownerId: currentUserId };
}

function countFromRows(rows) {
  return Number(rows?.[0]?.count || 0);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeWhitespace(input) {
  return decodeHtmlEntities(input).replace(/\s+/g, " ").trim();
}

function stripHtmlTags(input) {
  return String(input || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function getFirstMatch(input, regex) {
  const match = String(input || "").match(regex);
  return match?.[1] || "";
}

function extractMetaContent(html, attrName, attrValue) {
  const escaped = escapeRegex(attrValue);
  const attrPattern = `${attrName}\\s*=\\s*["']${escaped}["']`;
  const patterns = [
    new RegExp(`<meta[^>]*${attrPattern}[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attrPattern}[^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const result = getFirstMatch(html, pattern);
    if (result) return normalizeWhitespace(result);
  }

  return "";
}

function extractCanonicalUrl(html, pageUrl, rootHostname) {
  const href = getFirstMatch(
    html,
    /<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i
  ) || getFirstMatch(
    html,
    /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i
  );

  if (!href) return null;

  try {
    const resolved = new URL(href, pageUrl);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    if (!isSameSiteHost(rootHostname, resolved.hostname)) return null;
    return canonicalizePageUrl(resolved.toString());
  } catch {
    return null;
  }
}

function buildSyntheticUserId(pathLabel) {
  const normalized = String(pathLabel || "/")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .slice(0, 120);

  return `${SITE_SCAN_USER_PREFIX}${normalized || "/"}`;
}

function isSameSiteHost(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === `www.${b}` || b === `www.${a}`) return true;
  return false;
}

function isLikelyHtmlPath(pathname) {
  return !NON_HTML_FILE_PATTERN.test(pathname || "");
}

function canonicalizePageUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  parsed.search = "";
  parsed.username = "";
  parsed.password = "";

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  return parsed.toString();
}

function buildPathLabel(rawUrl) {
  const parsed = new URL(rawUrl);
  return parsed.pathname || "/";
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

function resolveTrackedPageUrl(siteUrl, rawPath) {
  if (!siteUrl) return null;
  if (!rawPath) return siteUrl;

  try {
    return new URL(String(rawPath), siteUrl).toString();
  } catch {
    return siteUrl;
  }
}

function normalizeTrackedPagePath(siteUrl, rawPath) {
  const resolvedUrl = resolveTrackedPageUrl(siteUrl, rawPath);

  if (resolvedUrl) {
    try {
      return buildPathLabel(canonicalizePageUrl(resolvedUrl));
    } catch {
      // Fall back to the raw path handling below.
    }
  }

  const fallback = String(rawPath || "/").trim();
  if (!fallback) return "/";

  return fallback.split(/[?#]/)[0] || "/";
}

function buildLiveTrackingSql(siteUrl) {
  const aliases = getSiteHostAliases(siteUrl);
  const hostFilter = aliases.length > 0
    ? Prisma.sql`(
        JSON_EXTRACT(properties, '$.host') IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(properties, '$.host')) IN (${Prisma.join(aliases)})
      )`
    : Prisma.sql`1 = 1`;

  return Prisma.sql`
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')), '') <> ${SITE_SCAN_SOURCE}
    AND ${hostFilter}
  `;
}

function prepareSiteUrl(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) {
    throw new Error("Site URL is required");
  }

  const hasProtocol = /^https?:\/\//i.test(raw);
  const primaryUrl = canonicalizePageUrl(hasProtocol ? raw : `https://${raw}`);
  const fallbackUrl = hasProtocol ? null : canonicalizePageUrl(`http://${raw}`);

  const parsed = new URL(primaryUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported");
  }

  return {
    primaryUrl,
    fallbackUrl,
  };
}

function extractLinks(html, pageUrl, rootHostname) {
  const internal = new Set();
  const external = new Set();
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(String(html || "")))) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    try {
      const resolved = new URL(href, pageUrl);
      if (!["http:", "https:"].includes(resolved.protocol)) continue;
      if (!isLikelyHtmlPath(resolved.pathname)) continue;

      const normalized = canonicalizePageUrl(resolved.toString());
      if (isSameSiteHost(rootHostname, resolved.hostname)) internal.add(normalized);
      else external.add(normalized);
    } catch {
      // Ignore invalid hrefs inside malformed HTML.
    }
  }

  return {
    internalLinks: Array.from(internal),
    externalLinks: Array.from(external),
  };
}

function detectTechHints({ html, finalUrl, headers }) {
  const content = String(html || "");
  const headerServer = String(headers?.server || "");
  const combined = `${content}\n${finalUrl}\n${headerServer}`;
  const signatures = [
    { label: "WordPress", pattern: /wp-content|wp-includes/i },
    { label: "Shopify", pattern: /cdn\.shopify\.com|shopify/i },
    { label: "Next.js", pattern: /_next\/|__NEXT_DATA__/i },
    { label: "Nuxt", pattern: /_nuxt\/|__NUXT__/i },
    { label: "React", pattern: /react|data-reactroot|id=["']root["']/i },
    { label: "Vue", pattern: /vue(?:\.runtime)?|data-v-/i },
    { label: "Tailwind CSS", pattern: /tailwind/i },
    { label: "Bootstrap", pattern: /bootstrap/i },
    { label: "Google Analytics", pattern: /googletagmanager\.com|google-analytics\.com|gtag\(/i },
    { label: "Cloudflare", pattern: /cloudflare/i },
    { label: "Hotjar", pattern: /hotjar/i },
  ];

  return signatures.filter((item) => item.pattern.test(combined)).map((item) => item.label);
}

function classifyPage({ path, title, formCount }) {
  const haystack = `${path} ${title}`.toLowerCase();

  if (/pricing|plans|checkout|cart|shop|product|order|pricing/i.test(haystack)) return "Commerce";
  if (/blog|article|news|docs|guide|resources/i.test(haystack)) return "Content";
  if (/support|help|faq|contact|ticket/i.test(haystack)) return "Support";
  if (formCount > 0 || path === "/" || /home|welcome|start/i.test(haystack)) return "Landing";
  return "Utility";
}

function buildPageIssues({ statusCode, title, metaDescription, responseTimeMs, isHttps }) {
  const issues = [];

  if (statusCode >= 400) {
    issues.push({
      code: "page_unreachable",
      message: `Returned status ${statusCode}`,
      severity: "critical",
    });
  }

  if (!title) {
    issues.push({
      code: "missing_title",
      message: "Missing <title> tag",
      severity: "warning",
    });
  }

  if (!metaDescription) {
    issues.push({
      code: "missing_meta_description",
      message: "Missing meta description",
      severity: "warning",
    });
  }

  if (responseTimeMs > 2500) {
    issues.push({
      code: "slow_response",
      message: `Slow response (${responseTimeMs}ms)`,
      severity: "warning",
    });
  }

  if (!isHttps) {
    issues.push({
      code: "insecure_protocol",
      message: "Site is not using HTTPS",
      severity: "warning",
    });
  }

  return issues;
}

function toNumber(input) {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function formatTopPageStatus({ issueCount = 0, statusCode = 0, hasHealthData = false, hasTimingData = false }) {
  if (issueCount > 0) return `${issueCount} issues`;
  if (statusCode >= 400) return `HTTP ${statusCode}`;
  if (hasHealthData) return "Healthy";
  if (hasTimingData) return "Tracked";
  return "Live";
}

function formatTopPageAvgTime({ averageTimeMs = 0, hasHealthData = false, hasTimingData = false }) {
  const rounded = Math.round(toNumber(averageTimeMs));
  if (rounded > 0) return `${rounded}ms`;
  if (hasHealthData) return "Scanned";
  if (hasTimingData) return "Tracked";
  return "Live";
}

function formatSiteName(siteUrl, title) {
  if (title) return title.slice(0, 180);

  try {
    const parsed = new URL(siteUrl);
    return parsed.hostname.replace(/^www\./i, "").slice(0, 180);
  } catch {
    return "Connected site";
  }
}

async function fetchSiteDocument(targetUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SITE_SCAN_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "QuantumStarsSiteScanner/1.0 (+server-side analysis)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });

    const responseTimeMs = Date.now() - startedAt;
    const finalUrl = response.url || targetUrl;
    const contentType = response.headers.get("content-type") || "";
    const isHtml = !contentType || contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
    const html = isHtml ? await response.text() : "";

    return {
      ok: response.ok,
      statusCode: response.status,
      finalUrl,
      responseTimeMs,
      contentType,
      html,
      headers: {
        server: response.headers.get("server") || "",
      },
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timed out while loading ${targetUrl}`);
    }

    throw new Error(`Unable to load ${targetUrl}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function analyzeSitePage(document, rootHostname) {
  const title = normalizeWhitespace(getFirstMatch(document.html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDescription =
    extractMetaContent(document.html, "name", "description") ||
    extractMetaContent(document.html, "property", "og:description");
  const textContent = normalizeWhitespace(stripHtmlTags(document.html));
  const contentSignature = crypto
    .createHash("sha1")
    .update(`${title}\n${metaDescription}\n${textContent.slice(0, 5000)}`)
    .digest("hex");
  const canonicalUrl = extractCanonicalUrl(document.html, document.finalUrl, rootHostname);
  const wordCount = textContent ? textContent.split(/\s+/).filter(Boolean).length : 0;
  const { internalLinks, externalLinks } = extractLinks(document.html, document.finalUrl, rootHostname);
  const formCount = (document.html.match(/<form\b/gi) || []).length;
  const imageCount = (document.html.match(/<img\b/gi) || []).length;
  const scriptCount = (document.html.match(/<script\b/gi) || []).length;
  const stylesheetCount = (document.html.match(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi) || []).length;
  const headingCount = (document.html.match(/<h[1-6]\b/gi) || []).length;
  const techHints = detectTechHints(document);
  const path = buildPathLabel(document.finalUrl);
  const pageType = classifyPage({ path, title, formCount });
  const issues = buildPageIssues({
    statusCode: document.statusCode,
    title,
    metaDescription,
    responseTimeMs: document.responseTimeMs,
    isHttps: document.finalUrl.startsWith("https://"),
  });

  return {
    fullUrl: canonicalUrl || document.finalUrl,
    canonicalUrl,
    path: buildPathLabel(canonicalUrl || document.finalUrl) || path,
    title,
    metaDescription,
    statusCode: document.statusCode,
    responseTimeMs: document.responseTimeMs,
    internalLinks,
    externalLinks,
    formCount,
    imageCount,
    scriptCount,
    stylesheetCount,
    headingCount,
    wordCount,
    techHints,
    pageType,
    issues,
    contentSignature,
    healthLabel: issues.some((issue) => issue.severity === "critical")
      ? "Critical"
      : issues.length > 0
        ? "Needs attention"
        : "Healthy",
  };
}

function summarizePages(pages) {
  const techCounts = new Map();
  const healthCounts = new Map();
  const totalIssues = pages.reduce((sum, page) => sum + page.issues.length, 0);
  const totalPages = pages.length;

  pages.forEach((page) => {
    page.techHints.forEach((hint) => {
      techCounts.set(hint, (techCounts.get(hint) || 0) + 1);
    });

    healthCounts.set(page.healthLabel, (healthCounts.get(page.healthLabel) || 0) + 1);
  });

  const totalResponseTime = pages.reduce((sum, page) => sum + page.responseTimeMs, 0);
  const internalLinks = pages.reduce((sum, page) => sum + page.internalLinks.length, 0);
  const externalLinks = pages.reduce((sum, page) => sum + page.externalLinks.length, 0);
  const totalWords = pages.reduce((sum, page) => sum + page.wordCount, 0);
  const totalImages = pages.reduce((sum, page) => sum + page.imageCount, 0);
  const totalForms = pages.reduce((sum, page) => sum + page.formCount, 0);
  const healthScore = Math.max(0, 100 - Math.round((totalIssues / Math.max(1, totalPages * 4)) * 100));

  return {
    pagesScanned: totalPages,
    issuesFound: totalIssues,
    internalLinks,
    externalLinks,
    averageResponseTimeMs: totalPages > 0 ? Math.round(totalResponseTime / totalPages) : 0,
    totalWords,
    totalImages,
    totalForms,
    healthScore,
    technologies: Array.from(techCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count),
    health: Array.from(healthCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count),
  };
}

async function scanSite(siteUrl) {
  const rootUrl = new URL(siteUrl);
  const queue = [siteUrl];
  const visited = new Set();
  const pages = [];
  const pageSignatures = new Set();
  const pageUrls = new Set();

  while (queue.length > 0 && pages.length < SITE_SCAN_PAGE_LIMIT) {
    const nextUrl = queue.shift();
    const canonicalUrl = canonicalizePageUrl(nextUrl);
    if (visited.has(canonicalUrl)) continue;

    visited.add(canonicalUrl);

    let document;
    try {
      document = await fetchSiteDocument(canonicalUrl);
    } catch (error) {
      if (pages.length === 0) throw error;
      continue;
    }

    const finalUrl = canonicalizePageUrl(document.finalUrl);
    const finalHost = new URL(finalUrl).hostname;
    if (!isSameSiteHost(rootUrl.hostname, finalHost)) {
      if (pages.length === 0) {
        throw new Error("The site redirected to a different host and could not be analyzed safely");
      }
      continue;
    }

    const page = analyzeSitePage({ ...document, finalUrl }, rootUrl.hostname);
    const normalizedPageUrl = canonicalizePageUrl(page.fullUrl);

    if (pageSignatures.has(page.contentSignature) || pageUrls.has(normalizedPageUrl)) {
      continue;
    }

    pageSignatures.add(page.contentSignature);
    pageUrls.add(normalizedPageUrl);
    pages.push({
      ...page,
      fullUrl: normalizedPageUrl,
      path: buildPathLabel(normalizedPageUrl),
    });

    page.internalLinks.forEach((link) => {
      const normalized = canonicalizePageUrl(link);
      if (!visited.has(normalized) && !queue.includes(normalized) && queue.length + pages.length < SITE_SCAN_PAGE_LIMIT * 4) {
        queue.push(normalized);
      }
    });
  }

  if (pages.length === 0) {
    throw new Error("No crawlable HTML pages were found on that URL");
  }

  return {
    siteUrl,
    siteName: formatSiteName(siteUrl, pages[0]?.title),
    pages,
    summary: summarizePages(pages),
  };
}

function toPlainProperties(input) {
  if (!input) return {};
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }
  return input;
}

function formatExportTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function toExportCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function toExportNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function buildEventExportRows(events) {
  return events.map((event) => {
    const properties = toPlainProperties(event.properties);

    return {
      Timestamp: formatExportTimestamp(event.timestamp),
      Event: event.eventName || "",
      "User ID": event.userId || "anonymous",
      Page: toExportCellValue(properties.url || properties.page || properties.path || ""),
      Country: toExportCellValue(properties.country || ""),
      Device: toExportCellValue(properties.device || ""),
      Browser: toExportCellValue(properties.browser || ""),
      Referrer: toExportCellValue(properties.referrer || ""),
      Host: toExportCellValue(properties.host || ""),
      "Session ID": toExportCellValue(properties.sessionId || properties.session || ""),
      Source: toExportCellValue(properties.source || ""),
      "Response Time (ms)": toExportNumber(properties.responseTimeMs ?? properties.loadTimeMs),
      "Status Code": toExportNumber(properties.statusCode),
      Title: toExportCellValue(properties.title || ""),
      Value: toExportCellValue(properties.value ?? ""),
      "Owner Email": event.owner?.email || "",
      "Properties JSON": toExportCellValue(properties),
    };
  });
}

function buildSummaryExportRows(range, req, events, dashboardMode, isAdmin) {
  return [
    { Metric: "Range", Value: range },
    { Metric: "Exported At", Value: formatExportTimestamp(new Date()) },
    { Metric: "Scope", Value: isAdmin ? "All users" : req.user?.email || "Current user" },
    { Metric: "Connected Site", Value: dashboardMode?.siteUrl || "All sites" },
    { Metric: "Live Tracking Detected", Value: dashboardMode?.liveTrackingDetected ? "Yes" : "No" },
    { Metric: "Total Events", Value: events.length },
  ];
}

function setWorksheetColumnWidths(worksheet, rows) {
  const sourceRows = rows.length > 0 ? rows : [{ Notice: "No rows available" }];
  const headers = Object.keys(sourceRows[0]);

  worksheet["!cols"] = headers.map((header) => {
    const maxContentWidth = sourceRows.reduce((max, row) => {
      const value = row[header];
      return Math.max(max, String(value ?? "").length);
    }, header.length);

    return {
      wch: Math.min(Math.max(maxContentWidth + 2, 12), 42),
    };
  });
}

async function clearExistingSiteScanEvents(ownerId) {
  await prisma.$executeRaw`
    DELETE FROM Event
    WHERE ownerId = ${ownerId}
      AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
  `;
}

async function clearExistingSiteScanEventsForSite(ownerId, siteUrl) {
  await prisma.$executeRaw`
    DELETE FROM Event
    WHERE ownerId = ${ownerId}
      AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
      AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${siteUrl}
  `;
}

async function createSyntheticEvent(ownerId, eventName, userId, properties, timestamp) {
  const created = await prisma.event.create({
    data: {
      ownerId,
      eventName,
      userId,
      properties,
      timestamp,
    },
  });

  await publishEvent("live_events", {
    ownerId,
    event: {
      id: created.id,
      eventName: created.eventName,
      userId: created.userId,
      properties: created.properties,
      timestamp: created.timestamp,
    },
  });

  return created;
}

async function createSiteScanEvents(ownerId, scanResult) {
  await clearExistingSiteScanEventsForSite(ownerId, scanResult.siteUrl);

  const baseTime = Date.now();

  for (let index = 0; index < scanResult.pages.length; index += 1) {
    const page = scanResult.pages[index];
    const pageUserId = buildSyntheticUserId(page.path);
    const pageTimestamp = new Date(baseTime + index * 1000);

    await createSyntheticEvent(
      ownerId,
      "page_view",
      pageUserId,
      {
        source: SITE_SCAN_SOURCE,
        siteUrl: scanResult.siteUrl,
        url: page.path,
        fullUrl: page.fullUrl,
        title: page.title,
        metaDescription: page.metaDescription,
        statusCode: page.statusCode,
        responseTimeMs: page.responseTimeMs,
        internalLinks: page.internalLinks.length,
        externalLinks: page.externalLinks.length,
        images: page.imageCount,
        scripts: page.scriptCount,
        stylesheets: page.stylesheetCount,
        headings: page.headingCount,
        forms: page.formCount,
        wordCount: page.wordCount,
        techHints: page.techHints,
        issueCount: page.issues.length,
        device: page.pageType,
        country: page.healthLabel,
      },
      pageTimestamp
    );

    if (page.internalLinks.length > 0) {
      await createSyntheticEvent(
        ownerId,
        "click",
        pageUserId,
        {
          source: SITE_SCAN_SOURCE,
          siteUrl: scanResult.siteUrl,
          url: page.path,
          fullUrl: page.fullUrl,
          count: page.internalLinks.length,
          device: page.pageType,
          country: page.healthLabel,
        },
        new Date(baseTime + index * 1000 + 200)
      );
    }

    if (page.formCount > 0) {
      await createSyntheticEvent(
        ownerId,
        "signup",
        pageUserId,
        {
          source: SITE_SCAN_SOURCE,
          siteUrl: scanResult.siteUrl,
          url: page.path,
          fullUrl: page.fullUrl,
          count: page.formCount,
          device: page.pageType,
          country: page.healthLabel,
        },
        new Date(baseTime + index * 1000 + 400)
      );
    }

    if (page.pageType === "Commerce") {
      await createSyntheticEvent(
        ownerId,
        "purchase",
        pageUserId,
        {
          source: SITE_SCAN_SOURCE,
          siteUrl: scanResult.siteUrl,
          url: page.path,
          fullUrl: page.fullUrl,
          device: page.pageType,
          country: page.healthLabel,
        },
        new Date(baseTime + index * 1000 + 600)
      );
    }

    for (let issueIndex = 0; issueIndex < page.issues.length; issueIndex += 1) {
      const issue = page.issues[issueIndex];
      await createSyntheticEvent(
        ownerId,
        "error",
        pageUserId,
        {
          source: SITE_SCAN_SOURCE,
          siteUrl: scanResult.siteUrl,
          url: page.path,
          fullUrl: page.fullUrl,
          issue: issue.code,
          message: issue.message,
          severity: issue.severity,
          device: page.pageType,
          country: issue.severity === "critical" ? "Critical" : "Needs attention",
        },
        new Date(baseTime + index * 1000 + 800 + issueIndex * 100)
      );
    }
  }
}

async function loadConnectedSiteSnapshot(ownerId, site) {
  if (!site?.url) {
    return { site: null, summary: null, pages: [] };
  }

  const { summaryRow, pageRows } = await getSiteSummaryRows(ownerId, site.url);

  return {
    site,
    summary: {
      pagesScanned: toNumber(summaryRow.pagesScanned),
      issuesFound: toNumber(summaryRow.issuesFound),
      internalLinks: toNumber(summaryRow.internalLinks),
      averageResponseTimeMs: Math.round(toNumber(summaryRow.averageResponseTimeMs)),
    },
    pages: pageRows.map((row) => {
      const properties = toPlainProperties(row.properties);
      return {
        page: properties.url || "/",
        fullUrl: properties.fullUrl || site.url,
        title: properties.title || "",
        internalLinks: toNumber(properties.internalLinks),
        issueCount: toNumber(properties.issueCount),
        responseTimeMs: toNumber(properties.responseTimeMs),
      };
    }),
  };
}

async function getSiteSummaryRows(ownerId, siteUrl = null) {
  const siteFilter = siteUrl || null;
  const [summaryRows, pageRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COUNT(*) as pagesScanned,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.internalLinks')) AS UNSIGNED)), 0) as internalLinks,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.issueCount')) AS UNSIGNED)), 0) as issuesFound,
        COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.responseTimeMs')) AS UNSIGNED)), 0) as averageResponseTimeMs
      FROM Event
      WHERE ownerId = ${ownerId}
        AND eventName = 'page_view'
        AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
        AND (${siteFilter} IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${siteFilter})
    `,
    prisma.$queryRaw`
      SELECT properties, timestamp
      FROM Event
      WHERE ownerId = ${ownerId}
        AND eventName = 'page_view'
        AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
        AND (${siteFilter} IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${siteFilter})
      ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.internalLinks')) AS UNSIGNED) DESC, timestamp DESC
      LIMIT 5
    `,
  ]);

  return {
    summaryRow: summaryRows?.[0] || {},
    pageRows: pageRows || [],
  };
}

async function getSiteScanPageLookup(ownerId, siteUrl) {
  if (!siteUrl) return new Map();

  const rows = await prisma.$queryRaw`
    SELECT properties
    FROM Event
    WHERE ownerId = ${ownerId}
      AND eventName = 'page_view'
      AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
      AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${siteUrl}
  `;

  const lookup = new Map();

  rows.forEach((row) => {
    const properties = toPlainProperties(row.properties);
    const keys = [
      properties.url || "/",
      properties.fullUrl ? normalizeTrackedPagePath(siteUrl, properties.fullUrl) : null,
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, properties);
      }
    });
  });

  return lookup;
}

function isSiteScanProperties(properties, siteUrl = null) {
  const plain = toPlainProperties(properties);
  if (plain.source !== SITE_SCAN_SOURCE) return false;
  if (!siteUrl) return true;
  return !plain.siteUrl || plain.siteUrl === siteUrl;
}

function isLiveTrackingProperties(properties, siteUrl = null) {
  const plain = toPlainProperties(properties);
  if (plain.source === SITE_SCAN_SOURCE) return false;
  if (!siteUrl) return true;
  return matchesSiteHost(siteUrl, plain.host);
}

function filterDashboardEvents(events, mode) {
  if (!mode?.connectedSite || !mode.liveTrackingDetected) return events;
  return events.filter((event) => isLiveTrackingProperties(event.properties, mode.siteUrl));
}

async function getDashboardModeContext(currentUserId, isAdmin = false) {
  if (isAdmin) {
    return {
      connectedSite: false,
      siteUrl: null,
      siteName: null,
      lastAnalyzedAt: null,
      liveTrackingDetected: false,
      siteMode: false,
    };
  }

  const siteState = await ensureUserSiteState(currentUserId);
  const activeSite = siteState?.activeSite || null;

  if (!activeSite?.url) {
    return {
      connectedSite: false,
      siteUrl: null,
      siteName: null,
      lastAnalyzedAt: null,
      liveTrackingDetected: false,
      siteMode: false,
    };
  }

  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM Event
    WHERE ownerId = ${currentUserId}
      AND eventName = 'page_view'
      AND ${buildLiveTrackingSql(activeSite.url)}
  `;

  const liveTrackingDetected = toNumber(rows?.[0]?.count) > 0;

  return {
    connectedSite: true,
    siteUrl: activeSite.url,
    siteName: activeSite.name,
    lastAnalyzedAt: activeSite.lastAnalyzedAt,
    liveTrackingDetected,
    siteMode: !liveTrackingDetected,
  };
}

async function getAuthRealtimeMetrics(req) {
  const { isAdmin, currentUserId } = getOwnerContext(req);
  const startDate = getRealtimeStartDate(5);

  const [authAttemptRows, authErrorRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM Event
      WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
        AND timestamp >= ${startDate}
        AND eventName IN ('auth_attempt', 'login', 'signin', 'signup', 'register')
    `,
    prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM Event
      WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
        AND timestamp >= ${startDate}
        AND (
          eventName = 'auth_error'
          OR (
            eventName = 'error'
            AND (
              LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')), '')) IN ('auth', 'auth_request', 'auth_xhr')
              OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.kind')), '')) = 'auth'
              OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.action')), '')) IN ('login', 'signin', 'signup', 'register', 'reset_password')
              OR JSON_EXTRACT(properties, '$.authRelated') = true
            )
          )
        )
    `,
  ]);

  const authAttempts5m = countFromRows(authAttemptRows);
  const authErrors5m = countFromRows(authErrorRows);
  const authBase = Math.max(authAttempts5m, authErrors5m);
  const authErrorRate5m = authBase > 0 ? (authErrors5m / authBase) * 100 : 0;

  return {
    authAttempts5m,
    authErrors5m,
    authErrorRate5m,
    timeWindowMinutes: 5,
  };
}

async function analyzeConnectedSiteForUser(userId, requestedUrl = null, options = {}) {
  const siteState = await ensureUserSiteState(userId);
  const currentUser = siteState?.user || null;

  if (!currentUser) {
    throw new Error("User not found");
  }

  const rawUrl = requestedUrl || siteState?.activeSite?.url || currentUser.siteUrl;
  if (!rawUrl) {
    throw new Error("Site URL is required");
  }

  const { primaryUrl, fallbackUrl } = prepareSiteUrl(rawUrl);

  let scanResult;
  let finalUrl = primaryUrl;

  try {
    scanResult = await scanSite(primaryUrl);
  } catch (primaryError) {
    if (!fallbackUrl) throw primaryError;
    finalUrl = fallbackUrl;
    scanResult = await scanSite(fallbackUrl);
  }

  const analyzedAt = new Date();
  const siteUrl = finalUrl.slice(0, 191);

  const nextSiteState = await upsertSiteAfterAnalysis(currentUser.id, {
    siteId: options.siteId || null,
    siteUrl,
    siteName: scanResult.siteName,
    lastAnalyzedAt: analyzedAt,
    setActive: options.setActive !== false,
  });

  await createSiteScanEvents(currentUser.id, { ...scanResult, siteUrl });

  const managedSite = nextSiteState?.sites?.find((site) => site.url === siteUrl) || nextSiteState?.activeSite || null;

  return {
    site: {
      id: managedSite?.id || null,
      url: siteUrl,
      name: scanResult.siteName,
      lastAnalyzedAt: analyzedAt.toISOString(),
      isActive: managedSite?.isActive ?? options.setActive !== false,
      isEnabled: managedSite?.isEnabled ?? true,
    },
    summary: scanResult.summary,
    sites: nextSiteState?.sites || [],
    activeSite: nextSiteState?.activeSite || null,
  };
}

async function connectSiteByUrl(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const result = await analyzeConnectedSiteForUser(currentUserId, req.body.siteUrl);

    res.json({
      success: true,
      message: "Site connected and analyzed successfully",
      site: result.site,
      summary: result.summary,
      sites: result.sites,
      activeSite: result.activeSite,
    });
  } catch (error) {
    console.error("Failed to connect site:", error);
    res.status(400).json({ error: error.message || "Failed to analyze site URL" });
  }
}

async function getConnectedSite(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const siteState = await ensureUserSiteState(currentUserId);
    const snapshot = await loadConnectedSiteSnapshot(currentUserId, siteState?.activeSite || null);

    res.json({
      ...snapshot,
      activeSite: siteState?.activeSite || null,
      sites: siteState?.sites || [],
    });
  } catch (error) {
    console.error("Failed to load connected site:", error);
    res.status(500).json({ error: "Failed to load connected site" });
  }
}

async function activateConnectedSite(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const nextState = await activateSite(currentUserId, req.params.siteId);

    if (!nextState) {
      return res.status(404).json({ error: "Site not found" });
    }

    const snapshot = await loadConnectedSiteSnapshot(currentUserId, nextState.activeSite || null);

    res.json({
      success: true,
      message: "Site activated successfully",
      ...snapshot,
      activeSite: nextState.activeSite,
      sites: nextState.sites,
    });
  } catch (error) {
    console.error("Failed to activate site:", error);
    res.status(500).json({ error: "Failed to activate site" });
  }
}

async function deactivateConnectedSite(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const nextState = await deactivateSite(currentUserId, req.params.siteId);

    if (!nextState) {
      return res.status(404).json({ error: "Site not found" });
    }

    const snapshot = await loadConnectedSiteSnapshot(currentUserId, nextState.activeSite || null);

    res.json({
      success: true,
      message: "Site deactivated successfully",
      ...snapshot,
      activeSite: nextState.activeSite,
      sites: nextState.sites,
      deactivatedSite: nextState.site,
    });
  } catch (error) {
    console.error("Failed to deactivate site:", error);
    res.status(500).json({ error: "Failed to deactivate site" });
  }
}

async function deleteConnectedSite(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const deletedState = await deleteSite(currentUserId, req.params.siteId);

    if (!deletedState) {
      return res.status(404).json({ error: "Site not found" });
    }

    if (deletedState.site?.url) {
      await clearExistingSiteScanEventsForSite(currentUserId, deletedState.site.url);
    }

    const snapshot = await loadConnectedSiteSnapshot(currentUserId, deletedState.activeSite || null);

    res.json({
      success: true,
      message: "Site deleted successfully",
      ...snapshot,
      activeSite: deletedState.activeSite,
      sites: deletedState.sites,
      deletedSite: deletedState.site,
    });
  } catch (error) {
    console.error("Failed to delete site:", error);
    res.status(500).json({ error: "Failed to delete site" });
  }
}

async function analyzeConnectedSiteById(req, res) {
  try {
    const currentUserId = req.user.userId || req.user.id;
    const siteId = Number(req.params.siteId);

    if (!Number.isFinite(siteId)) {
      return res.status(400).json({ error: "Invalid site ID" });
    }

    const siteState = await ensureUserSiteState(currentUserId);
    const selectedSite = (siteState?.sites || []).find((site) => site.id === siteId);

    if (!selectedSite) {
      return res.status(404).json({ error: "Site not found" });
    }

    const result = await analyzeConnectedSiteForUser(currentUserId, selectedSite.url, {
      siteId,
      setActive: selectedSite.isActive,
    });

    const snapshot = await loadConnectedSiteSnapshot(currentUserId, result.activeSite || selectedSite);

    res.json({
      success: true,
      message: "Site analyzed successfully",
      ...snapshot,
      site: result.site,
      activeSite: result.activeSite,
      sites: result.sites,
    });
  } catch (error) {
    console.error("Failed to analyze site:", error);
    res.status(400).json({ error: error.message || "Failed to analyze site" });
  }
}

async function collectEvent(req, res) {
  try {
    const apiKey = normalizeApiKey(req.body.apiKey || req.headers["x-api-key"]);

    if (!apiKey) {
      return res.status(401).json({ error: "Missing API Key" });
    }

    const normalizedPayload = normalizeTrackPayload(req.body);
    const nextProperties = normalizedPayload.properties || {};
    const source = String(nextProperties.source || "");
    const host = String(nextProperties.host || "").trim();

    const trackingOwner = await resolveTrackingOwner(
      apiKey,
      source === SITE_SCAN_SOURCE ? "" : host
    );

    if (!trackingOwner.ok) {
      return res.status(trackingOwner.status).json({ error: trackingOwner.error });
    }

    const result = await enqueueTrackedEvent({
      ownerId: trackingOwner.ownerId,
      eventName: normalizedPayload.eventName,
      userId: normalizedPayload.userId,
      properties: nextProperties,
    });

    res.status(result.queued ? 202 : 201).json({
      success: true,
      queued: result.queued,
      jobId: result.jobId || null,
      eventId: result.eventId || null,
    });
  } catch (error) {
    console.error("Failed to record event:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to record event" });
  }
}

async function getKpis(req, res) {
  try {
    const filter = getOwnerFilter(req);
    const startDate = getStartDate(req.query.range);
    const baseFilter = { ...filter, eventName: { not: "heartbeat" } };
    const isAdmin = isAdminEmail(req.user.email);
    const currentUserId = req.user.userId || req.user.id;
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);
    const realtimeMetricsPromise = getAuthRealtimeMetrics(req);
    const totalAccountsPromise = isAdmin ? prisma.user.count() : Promise.resolve(null);
    const newSignupsPromise = isAdmin ? prisma.user.count({ where: { createdAt: { gte: startDate } } }) : Promise.resolve(null);

    let totalEvents = 0;
    let totalUsers = 0;
    let pageViews = 0;
    let errors = 0;

    if (dashboardMode.connectedSite && dashboardMode.liveTrackingDetected) {
      const liveTrackingSql = buildLiveTrackingSql(dashboardMode.siteUrl);
      const [totalEventRows, uniqueUserRows, pageViewRows, errorRows] = await Promise.all([
        prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
            AND ${liveTrackingSql}
        `,
        prisma.$queryRaw`
          SELECT userId
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName <> 'heartbeat'
            AND userId IS NOT NULL
            AND timestamp >= ${startDate}
            AND ${liveTrackingSql}
          GROUP BY userId
        `,
        prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName = 'page_view'
            AND timestamp >= ${startDate}
            AND ${liveTrackingSql}
        `,
        prisma.$queryRaw`
          SELECT COUNT(*) as count
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName = 'error'
            AND timestamp >= ${startDate}
            AND ${liveTrackingSql}
        `,
      ]);

      totalEvents = countFromRows(totalEventRows);
      totalUsers = uniqueUserRows.length;
      pageViews = countFromRows(pageViewRows);
      errors = countFromRows(errorRows);
    } else {
      const [totalEventsCount, uniqueUsers, pageViewsCount, errorsCount] = await Promise.all([
        prisma.event.count({ where: { ...baseFilter, timestamp: { gte: startDate } } }),
        prisma.event.groupBy({
          by: ["userId"],
          where: { ...baseFilter, userId: { not: null }, timestamp: { gte: startDate } },
        }),
        prisma.event.count({ where: { ...filter, eventName: "page_view", timestamp: { gte: startDate } } }),
        prisma.event.count({ where: { ...filter, eventName: "error", timestamp: { gte: startDate } } }),
      ]);

      totalEvents = totalEventsCount;
      totalUsers = uniqueUsers.length;
      pageViews = pageViewsCount;
      errors = errorsCount;
    }

    const [realtimeMetrics, totalAccounts, newSignups] = await Promise.all([
      realtimeMetricsPromise,
      totalAccountsPromise,
      newSignupsPromise,
    ]);

    let siteMetrics = {
      connectedSite: dashboardMode.connectedSite,
      liveTrackingDetected: dashboardMode.liveTrackingDetected,
      siteMode: dashboardMode.siteMode,
      pagesScanned: 0,
      internalLinks: 0,
      averageResponseTimeMs: 0,
      issuesFound: 0,
    };

    if (dashboardMode.siteUrl) {
      const rows = await prisma.$queryRaw`
        SELECT
          COUNT(*) as pagesScanned,
          COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.internalLinks')) AS UNSIGNED)), 0) as internalLinks,
          COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.responseTimeMs')) AS UNSIGNED)), 0) as averageResponseTimeMs,
          COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.issueCount')) AS UNSIGNED)), 0) as issuesFound
        FROM Event
        WHERE ownerId = ${currentUserId}
          AND eventName = 'page_view'
          AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
          AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${dashboardMode.siteUrl}
      `;

      const row = rows?.[0] || {};
      siteMetrics = {
        ...siteMetrics,
        pagesScanned: toNumber(row.pagesScanned),
        internalLinks: toNumber(row.internalLinks),
        averageResponseTimeMs: Math.round(toNumber(row.averageResponseTimeMs)),
        issuesFound: toNumber(row.issuesFound),
      };
    }

    const errorRate = totalEvents > 0 ? (errors / totalEvents) * 100 : 0;

    res.json({
      totalEvents,
      totalUsers,
      pageViews,
      errors,
      errorRate,
      totalAccounts,
      newSignups,
      ...realtimeMetrics,
      ...siteMetrics,
    });
  } catch (err) {
    console.error("Failed to load KPIs:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getRealtimeSummary(req, res) {
  try {
    const metrics = await getAuthRealtimeMetrics(req);
    res.json(metrics);
  } catch (err) {
    console.error("Failed to load realtime summary:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getVisitors(req, res) {
  try {
    const filter = getOwnerFilter(req);
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);

    const startDate = new Date(currentHour);
    startDate.setHours(startDate.getHours() - 23);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    let recentPageViews = await prisma.event.findMany({
      where: {
        ...filter,
        eventName: "page_view",
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "asc" },
      select: {
        ownerId: true,
        timestamp: true,
        userId: true,
        properties: true,
      },
    });

    recentPageViews = filterDashboardEvents(recentPageViews, dashboardMode);

    const PAGE_VIEW_DEDUPE_WINDOW_MS = 2500;
    const lastSeenPageViewMap = new Map();
    const bucketMap = new Map();

    recentPageViews.forEach((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      const properties = toPlainProperties(event.properties);
      const url = properties.url || "/";
      const source = properties.source || "unknown";
      const dedupeKey = `${event.ownerId}|${event.userId || "anonymous"}|${url}|${source}`;
      const previousTime = lastSeenPageViewMap.get(dedupeKey);

      if (previousTime && eventTime - previousTime < PAGE_VIEW_DEDUPE_WINDOW_MS) {
        return;
      }

      lastSeenPageViewMap.set(dedupeKey, eventTime);

      const bucketDate = new Date(event.timestamp);
      bucketDate.setMinutes(0, 0, 0);
      const bucketKey = bucketDate.getTime();

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          pageViews: 0,
          visitorIds: new Set(),
        });
      }

      const bucket = bucketMap.get(bucketKey);
      bucket.pageViews += 1;
      if (event.userId) {
        bucket.visitorIds.add(event.userId);
      }
    });

    const series = Array.from({ length: 24 }, (_, index) => {
      const bucketDate = new Date(startDate);
      bucketDate.setHours(startDate.getHours() + index);

      const entry = bucketMap.get(bucketDate.getTime()) || { pageViews: 0, visitorIds: new Set() };

      return {
        timestamp: bucketDate.toISOString(),
        visitors: entry.visitorIds.size,
        pageViews: entry.pageViews,
      };
    });

    res.json(series);
  } catch (err) {
    console.error("Failed to load visitors:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getHourly(req, res) {
  try {
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const startDate = getStartDate(req.query.range);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    const data = dashboardMode.connectedSite && dashboardMode.liveTrackingDetected
      ? await prisma.$queryRaw`
          SELECT
            HOUR(timestamp) as hour,
            COUNT(*) as count,
            SUM(CASE WHEN eventName = 'error' THEN 1 ELSE 0 END) as errors
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
            AND ${buildLiveTrackingSql(dashboardMode.siteUrl)}
          GROUP BY hour
          ORDER BY hour ASC
        `
      : await prisma.$queryRaw`
          SELECT
            HOUR(timestamp) as hour,
            COUNT(*) as count,
            SUM(CASE WHEN eventName = 'error' THEN 1 ELSE 0 END) as errors
          FROM Event
          WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
          GROUP BY hour
          ORDER BY hour ASC
        `;

    res.json(
      data.map((row) => ({
        hour: Number(row.hour),
        count: Number(row.count),
        errors: Number(row.errors || 0),
      }))
    );
  } catch (err) {
    console.error("Failed to load hourly data:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getFunnel(req, res) {
  try {
    const filter = getOwnerFilter(req);
    const startDate = getStartDate(req.query.range);
    const currentUserId = req.user.userId || req.user.id;
    const isAdmin = isAdminEmail(req.user.email);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    const stages = dashboardMode.siteMode
      ? [
          { key: "page_view", label: "Pages scanned" },
          { key: "click", label: "Linked pages" },
          { key: "signup", label: "Pages with forms" },
          { key: "purchase", label: "Commerce pages" },
        ]
      : [
          { key: "page_view", label: "page_view" },
          { key: "click", label: "click" },
          { key: "signup", label: "signup" },
          { key: "purchase", label: "purchase" },
        ];

    const counts = dashboardMode.connectedSite && dashboardMode.liveTrackingDetected
      ? await Promise.all(
          stages.map(async (stage) => {
            const rows = await prisma.$queryRaw`
              SELECT COUNT(*) as count
              FROM Event
              WHERE ownerId = ${currentUserId}
                AND eventName = ${stage.key}
                AND timestamp >= ${startDate}
                AND ${buildLiveTrackingSql(dashboardMode.siteUrl)}
            `;

            return countFromRows(rows);
          })
        )
      : await Promise.all(
          stages.map((stage) =>
            prisma.event.count({ where: { ...filter, eventName: stage.key, timestamp: { gte: startDate } } })
          )
        );

    res.json(stages.map((stage, index) => ({ stage: stage.label, count: counts[index] })));
  } catch (err) {
    console.error("Failed to load funnel:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getTopPages(req, res) {
  try {
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    if (dashboardMode.connectedSite && dashboardMode.liveTrackingDetected) {
      const startDate = getStartDate(req.query.range);
      const [liveRows, siteScanLookup] = await Promise.all([
        prisma.$queryRaw`
          SELECT JSON_UNQUOTE(JSON_EXTRACT(properties, '$.url')) as page, COUNT(*) as views
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName = 'page_view'
            AND timestamp >= ${startDate}
            AND JSON_EXTRACT(properties, '$.url') IS NOT NULL
            AND ${buildLiveTrackingSql(dashboardMode.siteUrl)}
          GROUP BY page
          ORDER BY views DESC
          LIMIT 10
        `,
        getSiteScanPageLookup(currentUserId, dashboardMode.siteUrl),
      ]);

      return res.json(
        liveRows.map((row) => {
          const page = row.page || "/";
          const normalizedPage = normalizeTrackedPagePath(dashboardMode.siteUrl, page);
          const scanProperties = siteScanLookup.get(page) || siteScanLookup.get(normalizedPage) || {};
          const hasScanData = Object.keys(scanProperties).length > 0;
          const issueCount = toNumber(scanProperties.issueCount);
          const responseTimeMs = toNumber(scanProperties.responseTimeMs);
          const status = issueCount > 0 ? `${issueCount} issues` : hasScanData ? "Healthy" : "Live";
          const avgTime = responseTimeMs > 0 ? `${responseTimeMs}ms` : "Live";

          return {
            page,
            fullUrl: resolveTrackedPageUrl(dashboardMode.siteUrl, page),
            title: scanProperties.title || "",
            statusCode: toNumber(scanProperties.statusCode),
            views: Number(row.views),
            status,
            avgTime,
            health: status,
            load: avgTime,
          };
        })
      );
    }

    if (dashboardMode.siteUrl) {
      const data = await prisma.$queryRaw`
        SELECT properties
        FROM Event
        WHERE ownerId = ${currentUserId}
          AND eventName = 'page_view'
          AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE}
          AND JSON_UNQUOTE(JSON_EXTRACT(properties, '$.siteUrl')) = ${dashboardMode.siteUrl}
        ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.internalLinks')) AS UNSIGNED) DESC,
                 CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.responseTimeMs')) AS UNSIGNED) ASC
        LIMIT 10
      `;

      return res.json(
        data.map((row) => {
          const properties = toPlainProperties(row.properties);
          const issueCount = toNumber(properties.issueCount);
          const responseTimeMs = toNumber(properties.responseTimeMs);
          const status = issueCount > 0 ? `${issueCount} issues` : "Healthy";
          const avgTime = responseTimeMs > 0 ? `${responseTimeMs}ms` : "n/a";

          return {
            page: properties.url || "/",
            fullUrl: properties.fullUrl || dashboardMode.siteUrl,
            title: properties.title || "",
            statusCode: toNumber(properties.statusCode),
            views: toNumber(properties.internalLinks) + 1,
            status,
            avgTime,
            health: status,
            load: avgTime,
          };
        })
      );
    }

    const startDate = getStartDate(req.query.range);
    const data = await prisma.$queryRaw`
      SELECT
        JSON_UNQUOTE(JSON_EXTRACT(properties, '$.url')) as page,
        COUNT(*) as views,
        AVG(
          COALESCE(
            CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.responseTimeMs')) AS UNSIGNED),
            CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.loadTimeMs')) AS UNSIGNED)
          )
        ) as averageTimeMs,
        COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.issueCount')) AS UNSIGNED)), 0) as issueCount,
        COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.statusCode')) AS UNSIGNED)), 0) as statusCode,
        COALESCE(SUM(
          CASE
            WHEN JSON_UNQUOTE(JSON_EXTRACT(properties, '$.source')) = ${SITE_SCAN_SOURCE} THEN 1
            ELSE 0
          END
        ), 0) as siteScanCount,
        COALESCE(SUM(
          CASE
            WHEN JSON_EXTRACT(properties, '$.responseTimeMs') IS NOT NULL
              OR JSON_EXTRACT(properties, '$.loadTimeMs') IS NOT NULL THEN 1
            ELSE 0
          END
        ), 0) as timingSampleCount,
        COALESCE(MAX(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.fullUrl')), '')), '') as sampleFullUrl,
        COALESCE(COUNT(DISTINCT NULLIF(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.fullUrl')), '')), 0) as fullUrlCount
      FROM Event
      WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
        AND eventName = 'page_view'
        AND timestamp >= ${startDate}
        AND JSON_EXTRACT(properties, '$.url') IS NOT NULL
      GROUP BY page
      ORDER BY views DESC
      LIMIT 10
    `;

    res.json(
      data.map((row) => {
        const issueCount = toNumber(row.issueCount);
        const statusCode = toNumber(row.statusCode);
        const siteScanCount = toNumber(row.siteScanCount);
        const timingSampleCount = toNumber(row.timingSampleCount);
        const fullUrlCount = toNumber(row.fullUrlCount);
        const sampleFullUrl = String(row.sampleFullUrl || "");
        const hasHealthData = siteScanCount > 0 || issueCount > 0 || statusCode > 0;
        const hasTimingData = timingSampleCount > 0;

        return {
          page: row.page,
          fullUrl: fullUrlCount === 1 && sampleFullUrl ? sampleFullUrl : null,
          views: Number(row.views),
          statusCode,
          status: formatTopPageStatus({ issueCount, statusCode, hasHealthData, hasTimingData }),
          avgTime: formatTopPageAvgTime({
            averageTimeMs: row.averageTimeMs,
            hasHealthData,
            hasTimingData,
          }),
        };
      })
    );
  } catch (err) {
    console.error("Failed to load top pages:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getDevices(req, res) {
  try {
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const startDate = getStartDate(req.query.range);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    const data = dashboardMode.connectedSite && dashboardMode.liveTrackingDetected
      ? await prisma.$queryRaw`
          SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.device')), 'Unknown') as device, COUNT(*) as count
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
            AND ${buildLiveTrackingSql(dashboardMode.siteUrl)}
          GROUP BY device
        `
      : await prisma.$queryRaw`
          SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.device')), 'Unknown') as device, COUNT(*) as count
          FROM Event
          WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
          GROUP BY device
        `;

    res.json(data.map((row) => ({ device: row.device, count: Number(row.count) })));
  } catch (err) {
    console.error("Failed to load devices:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getCountries(req, res) {
  try {
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const startDate = getStartDate(req.query.range);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    const data = dashboardMode.connectedSite && dashboardMode.liveTrackingDetected
      ? await prisma.$queryRaw`
          SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.country')), 'Unknown') as country, COUNT(*) as count
          FROM Event
          WHERE ownerId = ${currentUserId}
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
            AND ${buildLiveTrackingSql(dashboardMode.siteUrl)}
          GROUP BY country
        `
      : await prisma.$queryRaw`
          SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.country')), 'Unknown') as country, COUNT(*) as count
          FROM Event
          WHERE (1 = ${isAdmin ? 1 : 0} OR ownerId = ${currentUserId})
            AND eventName <> 'heartbeat'
            AND timestamp >= ${startDate}
          GROUP BY country
        `;

    res.json(data.map((row) => ({ country: row.country, count: Number(row.count) })));
  } catch (err) {
    console.error("Failed to load countries:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getEvents(req, res) {
  try {
    const filter = getOwnerFilter(req);
    const startDate = getStartDate(req.query.range);
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);
    const requestedLimit = String(req.query.limit || "").trim().toLowerCase();
    const exportAll = requestedLimit === "all";
    const parsedLimit = Number.parseInt(requestedLimit, 10);
    const defaultTake = dashboardMode.connectedSite && dashboardMode.liveTrackingDetected ? 250 : 100;
    const responseLimit =
      !exportAll && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 5000)
        : 100;
    const queryTake = exportAll
      ? undefined
      : !Number.isFinite(parsedLimit) || parsedLimit <= 0
        ? defaultTake
        : responseLimit;

    let events = await prisma.event.findMany({
      where: { ...filter, eventName: { not: "heartbeat" }, timestamp: { gte: startDate } },
      orderBy: { timestamp: "desc" },
      include: { owner: { select: { email: true } } },
      ...(queryTake ? { take: queryTake } : {}),
    });

    events = filterDashboardEvents(events, dashboardMode);
    if (!exportAll) {
      events = events.slice(0, responseLimit);
    }

    res.json(events);
  } catch (err) {
    console.error("Failed to load events:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function getAllUsers(req, res) {
  try {
    if (!isAdminEmail(req.user.email)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        apiKey: true,
        siteUrl: true,
        siteName: true,
        lastAnalyzedAt: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(users);
  } catch (err) {
    console.error("Failed to load users:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

async function exportDashboard(req, res) {
  try {
    const filter = getOwnerFilter(req);
    const range = ["24h", "7d", "30d", "90d"].includes(req.query.range)
      ? req.query.range
      : "7d";
    const startDate = getStartDate(range);
    const { isAdmin, currentUserId } = getOwnerContext(req);
    const dashboardMode = await getDashboardModeContext(currentUserId, isAdmin);

    let events = await prisma.event.findMany({
      where: { ...filter, eventName: { not: "heartbeat" }, timestamp: { gte: startDate } },
      orderBy: { timestamp: "desc" },
      include: { owner: { select: { email: true } } },
    });

    events = filterDashboardEvents(events, dashboardMode);

    const summaryRows = buildSummaryExportRows(range, req, events, dashboardMode, isAdmin);
    const eventRows = buildEventExportRows(events);

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const eventsSheet = XLSX.utils.json_to_sheet(
      eventRows.length > 0 ? eventRows : [{ Notice: "No events found for the selected range." }]
    );

    setWorksheetColumnWidths(summarySheet, summaryRows);
    setWorksheetColumnWidths(eventsSheet, eventRows);

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, eventsSheet, "Events");

    const workbookBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });
    const filename = `dashboard-${range}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(workbookBuffer);
  } catch (err) {
    console.error("Failed to export dashboard:", err);
    res.status(500).json({ error: "Export failed" });
  }
}

module.exports = {
  analyzeConnectedSiteForUser,
  analyzeConnectedSiteById,
  activateConnectedSite,
  collectEvent,
  connectSiteByUrl,
  deactivateConnectedSite,
  deleteConnectedSite,
  getConnectedSite,
  getKpis,
  getRealtimeSummary,
  getVisitors,
  getHourly,
  getFunnel,
  getTopPages,
  getDevices,
  getCountries,
  getEvents,
  getAllUsers,
  exportDashboard,
};
