const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXPORT_TIME_ZONE = "Asia/Ulaanbaatar";
const EXPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: EXPORT_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const EXPORT_DAY_BUCKET_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: EXPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const EXPORT_HOUR_BUCKET_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: EXPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});
const EXPORT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: EXPORT_TIME_ZONE,
  weekday: "short",
});

const RANGE_WINDOW_CONFIG = {
  "24h": {
    label: "Last 24 hours",
    detail: "24 hour data with exact event timestamps and hourly timeline.",
    timelineLabel: "Hourly buckets for the selected 24 hour window",
    bucketType: "hour",
  },
  "7d": {
    label: "Last 7 days",
    detail: "7 day data with exact event timestamps and daily timeline.",
    timelineLabel: "Daily buckets for the selected 7 day window",
    bucketType: "day",
  },
  "30d": {
    label: "Last 30 days",
    detail: "30 day data with exact event timestamps and daily timeline.",
    timelineLabel: "Daily buckets for the selected 30 day window",
    bucketType: "day",
  },
  "90d": {
    label: "Last 90 days",
    detail: "90 day data with exact event timestamps and daily timeline.",
    timelineLabel: "Daily buckets for the selected 90 day window",
    bucketType: "day",
  },
};

function sanitizeFilenamePart(value) {
  return String(value || "dashboard")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "dashboard";
}

function parseExportDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFormatterPartMap(formatter, value) {
  const date = parseExportDate(value);
  if (!date) return {};

  return formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

export function formatExportTimestamp(value) {
  const date = parseExportDate(value);
  if (!date) return "";
  return `${EXPORT_DATE_FORMATTER.format(date)} (Ulaanbaatar)`;
}

export function buildDashboardExportFileStem(siteLabel, rangeKey) {
  const sitePart = sanitizeFilenamePart(siteLabel || "dashboard");
  const datePart = new Date().toISOString().slice(0, 10);
  return `${sitePart}-${rangeKey || "7d"}-${datePart}`;
}

function getRangeConfig(rangeKey) {
  return RANGE_WINDOW_CONFIG[rangeKey] || RANGE_WINDOW_CONFIG["7d"];
}

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function pickFirstFilled(...values) {
  for (const value of values) {
    if (isFilled(value)) return value;
  }
  return "";
}

function toPlainObject(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toExportCellValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
      .join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function parseNumericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toExportNumber(value) {
  const parsed = parseNumericValue(value);
  return parsed === null ? "" : parsed;
}

function joinUniqueValues(values, limit = 6) {
  const uniqueValues = Array.from(
    new Set(
      Array.from(values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (uniqueValues.length === 0) return "";
  if (uniqueValues.length <= limit) return uniqueValues.join(", ");
  return `${uniqueValues.slice(0, limit).join(", ")} +${uniqueValues.length - limit} more`;
}

function addCount(map, key, amount = 1) {
  if (!isFilled(key)) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function ensureAggregation(map, key, factory) {
  if (!map.has(key)) {
    map.set(key, factory());
  }
  return map.get(key);
}

function getTopCountLabel(map) {
  if (!(map instanceof Map) || map.size === 0) return "";

  return Array.from(map.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return String(left[0]).localeCompare(String(right[0]));
    })[0]?.[0] || "";
}

function getTopCountsSummary(map, limit = 5) {
  if (!(map instanceof Map) || map.size === 0) return "";

  return Array.from(map.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return String(left[0]).localeCompare(String(right[0]));
    })
    .slice(0, limit)
    .map(([label, count]) => `${label} (${count})`)
    .join(", ");
}

function updateSeenWindow(entry, date) {
  if (!date) return;
  if (!entry.firstSeen || date < entry.firstSeen) {
    entry.firstSeen = date;
  }
  if (!entry.lastSeen || date > entry.lastSeen) {
    entry.lastSeen = date;
  }
}

function getColumnWidthCap(header) {
  const normalizedHeader = String(header || "").toLowerCase();

  if (normalizedHeader.includes("json")) return 90;
  if (
    normalizedHeader.includes("message") ||
    normalizedHeader.includes("description") ||
    normalizedHeader.includes("snippet") ||
    normalizedHeader.includes("technolog") ||
    normalizedHeader.includes("event types") ||
    normalizedHeader.includes("sources") ||
    normalizedHeader.includes("sites") ||
    normalizedHeader.includes("status codes")
  ) {
    return 72;
  }
  if (
    normalizedHeader.includes("url") ||
    normalizedHeader.includes("endpoint") ||
    normalizedHeader.includes("title") ||
    normalizedHeader.includes("referrer")
  ) {
    return 60;
  }
  if (
    normalizedHeader.includes("timestamp") ||
    normalizedHeader.includes("occurred") ||
    normalizedHeader.includes("seen") ||
    normalizedHeader.includes("bucket")
  ) {
    return 32;
  }
  return 42;
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
      wch: Math.min(Math.max(maxContentWidth + 2, 12), getColumnWidthCap(header)),
    };
  });
}

function createSheet(workbook, XLSX, sheetName, rows, fallbackRow) {
  const normalizedRows = rows.length > 0 ? rows : [fallbackRow];
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
  setWorksheetColumnWidths(worksheet, normalizedRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || "Sheet").slice(0, 31));
}

function getExportDateMeta(value) {
  const date = parseExportDate(value);
  if (!date) {
    return {
      date: null,
      timestampLabel: "",
      isoTimestamp: "",
      dateLabel: "",
      timeLabel: "",
      weekdayLabel: "",
      hourOfDay: "",
      dayBucket: "",
      hourBucket: "",
    };
  }

  const fullParts = getFormatterPartMap(EXPORT_DATE_FORMATTER, date);
  const dayParts = getFormatterPartMap(EXPORT_DAY_BUCKET_FORMATTER, date);
  const hourParts = getFormatterPartMap(EXPORT_HOUR_BUCKET_FORMATTER, date);

  return {
    date,
    timestampLabel: formatExportTimestamp(date),
    isoTimestamp: date.toISOString(),
    dateLabel: fullParts.day && fullParts.month && fullParts.year
      ? `${fullParts.day} ${fullParts.month} ${fullParts.year}`
      : "",
    timeLabel: fullParts.hour && fullParts.minute && fullParts.second
      ? `${fullParts.hour}:${fullParts.minute}:${fullParts.second}`
      : "",
    weekdayLabel: EXPORT_WEEKDAY_FORMATTER.format(date),
    hourOfDay: fullParts.hour || "",
    dayBucket: dayParts.day && dayParts.month && dayParts.year
      ? `${dayParts.year}-${dayParts.month}-${dayParts.day}`
      : "",
    hourBucket: hourParts.day && hourParts.month && hourParts.year && hourParts.hour
      ? `${hourParts.year}-${hourParts.month}-${hourParts.day} ${hourParts.hour}:00`
      : "",
  };
}

function getUrlInfo(value, baseCandidates = []) {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      raw: "",
      absoluteUrl: "",
      path: "",
      host: "",
      origin: "",
    };
  }

  const candidates = [null, ...baseCandidates.filter(Boolean)];

  for (const base of candidates) {
    try {
      const parsed = base ? new URL(raw, base) : new URL(raw);
      return {
        raw,
        absoluteUrl: parsed.toString(),
        path: `${parsed.pathname || "/"}${parsed.search || ""}`,
        host: parsed.host || "",
        origin: parsed.origin || "",
      };
    } catch {
      // Try the next base candidate.
    }
  }

  return {
    raw,
    absoluteUrl: "",
    path: raw,
    host: "",
    origin: "",
  };
}

function normalizeEvent(row, context, originalIndex) {
  const properties = getEventProperties(row);
  const baseUrlCandidates = [
    properties.siteUrl,
    context?.siteUrl,
    properties.fullUrl,
    properties.requestUrl,
    properties.href,
  ];
  const timestampMeta = getExportDateMeta(row?.timestamp);
  const pageInfo = getUrlInfo(
    pickFirstFilled(row?.page, properties.url, properties.page, properties.path),
    baseUrlCandidates
  );
  const fullUrlInfo = getUrlInfo(properties.fullUrl, baseUrlCandidates);
  const requestUrlInfo = getUrlInfo(properties.requestUrl, baseUrlCandidates);
  const resourceUrlInfo = getUrlInfo(properties.resourceUrl, baseUrlCandidates);
  const hrefInfo = getUrlInfo(properties.href, baseUrlCandidates);
  const siteUrlInfo = getUrlInfo(pickFirstFilled(properties.siteUrl, context?.siteUrl), [context?.siteUrl]);
  const endpointCandidate = [
    { label: "Request", info: requestUrlInfo },
    { label: "Resource", info: resourceUrlInfo },
    { label: "Link", info: hrefInfo },
    { label: "Full URL", info: fullUrlInfo },
    { label: "Page", info: pageInfo },
  ].find((item) => isFilled(item.info.absoluteUrl) || isFilled(item.info.path) || isFilled(item.info.raw));

  const eventSite = pickFirstFilled(
    siteUrlInfo.origin,
    fullUrlInfo.origin,
    requestUrlInfo.origin,
    hrefInfo.origin,
    resourceUrlInfo.origin,
    properties.host,
    context?.siteUrl,
    context?.siteLabel
  );
  const eventHost = pickFirstFilled(
    properties.host,
    siteUrlInfo.host,
    fullUrlInfo.host,
    requestUrlInfo.host,
    hrefInfo.host,
    resourceUrlInfo.host
  );
  const statusCode = parseNumericValue(pickFirstFilled(properties.statusCode, properties.status));
  const responseTimeMs = parseNumericValue(
    pickFirstFilled(properties.responseTimeMs, properties.loadTimeMs)
  );
  const techHints = Array.isArray(properties.techHints)
    ? joinUniqueValues(properties.techHints, 10)
    : toExportCellValue(properties.techHints || "");

  return {
    originalIndex,
    eventId: row?.id || "",
    timestampDate: timestampMeta.date,
    timestampMs: timestampMeta.date ? timestampMeta.date.getTime() : null,
    timestampLabel: timestampMeta.timestampLabel || toExportCellValue(row?.time || ""),
    isoTimestamp: timestampMeta.isoTimestamp,
    dateLabel: timestampMeta.dateLabel,
    timeLabel: timestampMeta.timeLabel || toExportCellValue(row?.time || ""),
    weekdayLabel: timestampMeta.weekdayLabel,
    hourOfDay: timestampMeta.hourOfDay,
    dayBucket: timestampMeta.dayBucket,
    hourBucket: timestampMeta.hourBucket,
    eventName: row?.eventName || row?.event || "",
    action: toExportCellValue(properties.action || ""),
    userId: row?.userId || "anonymous",
    ownerEmail: row?.owner?.email || "",
    connectedSite: context?.siteLabel || "",
    connectedUrl: context?.siteUrl || "",
    eventSite: toExportCellValue(eventSite),
    host: toExportCellValue(eventHost),
    endpointType: endpointCandidate?.label || "",
    endpoint: toExportCellValue(
      pickFirstFilled(
        endpointCandidate?.info?.path,
        endpointCandidate?.info?.absoluteUrl,
        endpointCandidate?.info?.raw
      )
    ),
    endpointUrl: toExportCellValue(
      pickFirstFilled(endpointCandidate?.info?.absoluteUrl, endpointCandidate?.info?.raw)
    ),
    page: toExportCellValue(pickFirstFilled(pageInfo.path, pageInfo.raw)),
    requestUrl: toExportCellValue(pickFirstFilled(requestUrlInfo.absoluteUrl, requestUrlInfo.raw)),
    fullUrl: toExportCellValue(pickFirstFilled(fullUrlInfo.absoluteUrl, fullUrlInfo.raw)),
    linkUrl: toExportCellValue(pickFirstFilled(hrefInfo.absoluteUrl, hrefInfo.raw)),
    resourceUrl: toExportCellValue(
      pickFirstFilled(resourceUrlInfo.absoluteUrl, resourceUrlInfo.raw)
    ),
    source: toExportCellValue(properties.source || row?.source || ""),
    method: toExportCellValue(properties.method || ""),
    statusCode,
    responseTimeMs,
    severity: toExportCellValue(properties.severity || ""),
    issue: toExportCellValue(properties.issue || ""),
    kind: toExportCellValue(properties.kind || ""),
    message: toExportCellValue(properties.message || ""),
    country: toExportCellValue(row?.country || properties.country || ""),
    device: toExportCellValue(properties.device || ""),
    browser: toExportCellValue(properties.browser || ""),
    referrer: toExportCellValue(properties.referrer || ""),
    sessionId: toExportCellValue(properties.sessionId || properties.session || ""),
    title: toExportCellValue(properties.title || ""),
    tag: toExportCellValue(properties.tag || properties.tagName || ""),
    text: toExportCellValue(properties.text || ""),
    value: toExportCellValue(properties.value ?? ""),
    count: parseNumericValue(properties.count),
    internalLinks: parseNumericValue(properties.internalLinks),
    externalLinks: parseNumericValue(properties.externalLinks),
    forms: parseNumericValue(properties.forms),
    images: parseNumericValue(properties.images),
    scripts: parseNumericValue(properties.scripts),
    stylesheets: parseNumericValue(properties.stylesheets),
    headings: parseNumericValue(properties.headings),
    wordCount: parseNumericValue(properties.wordCount),
    issueCount: parseNumericValue(properties.issueCount),
    metaDescription: toExportCellValue(properties.metaDescription || ""),
    technologies: techHints,
    propertiesJson: Object.keys(properties).length > 0 ? toExportCellValue(properties) : "",
  };
}

function normalizeEvents(events = [], context = {}) {
  return events
    .map((row, index) => normalizeEvent(row, context, index))
    .sort((left, right) => {
      if (left.timestampMs === null && right.timestampMs === null) {
        return left.originalIndex - right.originalIndex;
      }
      if (left.timestampMs === null) return 1;
      if (right.timestampMs === null) return -1;
      return right.timestampMs - left.timestampMs;
    });
}

function buildSummaryRows({
  dateRangeKey,
  dateRangeLabel,
  siteLabel,
  siteUrl,
  isAdmin,
  liveTrackingDetected,
  siteSnapshot,
  normalizedEvents,
  kpis,
}) {
  const rangeConfig = getRangeConfig(dateRangeKey);
  const userIds = new Set();
  const endpoints = new Set();
  const sites = new Set();
  const eventTypes = new Map();
  const ownerEmails = new Set();
  let firstSeen = null;
  let lastSeen = null;
  let pageViews = 0;
  let clicks = 0;
  let errors = 0;
  let authAttempts = 0;

  normalizedEvents.forEach((event) => {
    if (isFilled(event.userId)) userIds.add(event.userId);
    if (isFilled(event.endpoint)) endpoints.add(event.endpoint);
    if (isFilled(event.eventSite)) sites.add(event.eventSite);
    if (isFilled(event.ownerEmail)) ownerEmails.add(event.ownerEmail);
    addCount(eventTypes, event.eventName);

    if (event.timestampDate) {
      if (!firstSeen || event.timestampDate < firstSeen) firstSeen = event.timestampDate;
      if (!lastSeen || event.timestampDate > lastSeen) lastSeen = event.timestampDate;
    }

    if (event.eventName === "page_view") pageViews += 1;
    if (event.eventName === "click") clicks += 1;
    if (event.eventName === "error") errors += 1;
    if (event.eventName === "auth_attempt") authAttempts += 1;
  });

  const siteSummary = siteSnapshot?.summary || null;
  const lastAnalyzedAt =
    siteSnapshot?.activeSite?.lastAnalyzedAt || siteSnapshot?.site?.lastAnalyzedAt || null;

  return [
    { Metric: "Requested Range", Value: dateRangeLabel || rangeConfig.label },
    { Metric: "Range Key", Value: dateRangeKey || "7d" },
    { Metric: "Range Detail", Value: rangeConfig.detail },
    { Metric: "Timeline View", Value: rangeConfig.timelineLabel },
    { Metric: "Generated At", Value: formatExportTimestamp(new Date()) },
    { Metric: "Scope", Value: isAdmin ? "All users" : "Current user dashboard" },
    { Metric: "Connected Site", Value: siteLabel || "Not connected" },
    { Metric: "Connected URL", Value: siteUrl || "N/A" },
    {
      Metric: "Tracking Mode",
      Value: liveTrackingDetected ? "Live tracking" : "URL monitoring",
    },
    {
      Metric: "Last Analyzed",
      Value: formatExportTimestamp(lastAnalyzedAt),
    },
    { Metric: "Exported Event Rows", Value: normalizedEvents.length },
    { Metric: "KPI Total Events", Value: Number(kpis?.totalEvents || 0) },
    { Metric: "Unique Event Types", Value: eventTypes.size },
    { Metric: "Unique Users", Value: userIds.size },
    { Metric: "Unique Endpoints", Value: endpoints.size },
    { Metric: "Unique Sites", Value: sites.size },
    { Metric: "First Event", Value: formatExportTimestamp(firstSeen) || "N/A" },
    { Metric: "Last Event", Value: formatExportTimestamp(lastSeen) || "N/A" },
    { Metric: "Page Views", Value: pageViews },
    { Metric: "Clicks", Value: clicks },
    { Metric: "Errors", Value: errors },
    { Metric: "Auth Attempts", Value: authAttempts },
    { Metric: "Top Event Types", Value: getTopCountsSummary(eventTypes, 5) || "N/A" },
    { Metric: "Sites In Export", Value: joinUniqueValues(sites, 6) || "N/A" },
    { Metric: "Owner Emails", Value: joinUniqueValues(ownerEmails, 6) || "N/A" },
    {
      Metric: "Pages Scanned",
      Value: siteSummary ? Number(siteSummary.pagesScanned || 0) : "",
    },
    {
      Metric: "Issues Found",
      Value: siteSummary ? Number(siteSummary.issuesFound || 0) : "",
    },
    {
      Metric: "Internal Links",
      Value: siteSummary ? Number(siteSummary.internalLinks || 0) : "",
    },
    {
      Metric: "Average Response (ms)",
      Value: siteSummary ? Number(siteSummary.averageResponseTimeMs || 0) : "",
    },
  ];
}

function buildKpiRows(kpis = {}) {
  return [
    { KPI: "Total Events", Value: Number(kpis.totalEvents || 0) },
    { KPI: "Unique Users", Value: Number(kpis.totalUsers || 0) },
    { KPI: "Page Views", Value: Number(kpis.pageViews || 0) },
    { KPI: "Errors", Value: Number(kpis.errors || 0) },
    { KPI: "Pages Scanned", Value: Number(kpis.pagesScanned || 0) },
    { KPI: "Internal Links", Value: Number(kpis.internalLinks || 0) },
    { KPI: "Issues Found", Value: Number(kpis.issuesFound || 0) },
    { KPI: "Average Response (ms)", Value: Number(kpis.averageResponseTimeMs || 0) },
    { KPI: "Auth Attempts (5m)", Value: Number(kpis.authAttempts5m || 0) },
    { KPI: "Auth Errors (5m)", Value: Number(kpis.authErrors5m || 0) },
    { KPI: "Error Rate (%)", Value: Number(kpis.errorRate || 0).toFixed(2) },
    { KPI: "Bounce Rate (%)", Value: Number(kpis.bounceRate || 0).toFixed(2) },
  ];
}

function buildVisitorRows(visitors = []) {
  return visitors.map((row) => ({
    Timestamp: row.fullLabel || row.timestamp || "",
    Visitors: toExportNumber(row.visitors),
    "Page Views": toExportNumber(row.pageViews),
  }));
}

function buildHourlyRows(hourly = []) {
  return hourly.map((row) => ({
    Hour: row.hour || "",
    Events: toExportNumber(row.events),
    Errors: toExportNumber(row.errors),
  }));
}

function buildFunnelRows(funnel = []) {
  return funnel.map((row) => ({
    Stage: row.stage || "",
    Value: toExportNumber(row.value !== undefined ? row.value : row.count),
    "Percent (%)": toExportNumber(row.pct !== undefined ? row.pct : row.rate),
  }));
}

function buildTopPagesRows(topPages = []) {
  return topPages.map((row) => ({
    Page: row.page || "",
    Title: row.title || "",
    URL: row.href || row.fullUrl || "",
    Views: toExportNumber(row.views),
    Status: toExportCellValue(row.status || row.health || row.bounce || ""),
    "Average Time": toExportCellValue(row.avgTime || row.avg || row.load || ""),
    "Status Code": toExportNumber(row.statusCode),
  }));
}

function buildDeviceRows(deviceData = []) {
  return deviceData.map((row) => ({
    Device: row.name || "",
    Value: toExportNumber(row.value),
  }));
}

function buildCountryRows(countryData = []) {
  return countryData.map((row) => ({
    Country: row.country || row.name || "",
    Visitors: toExportNumber(row.visitors !== undefined ? row.visitors : row.count),
  }));
}

function buildAlertRows(alerts = []) {
  return alerts.map((row) => ({
    Type: row.type || "",
    Message: row.message || "",
    Time: row.time || "",
    Source: row.source || "",
  }));
}

function getEventProperties(row) {
  return toPlainObject(row?.properties);
}

function formatRawEventTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  const date = parseExportDate(value);
  if (!date) return toExportCellValue(value);
  return date.toISOString();
}

function buildRawEventRows(events = []) {
  return events.map((row) => {
    const properties = getEventProperties(row);

    return {
      id: row?.id ?? "",
      eventName: row?.eventName || row?.event || "",
      userId: row?.userId ?? "",
      country: toExportCellValue(row?.country ?? properties.country ?? ""),
      device: toExportCellValue(properties.device ?? ""),
      properties: Object.keys(properties).length > 0
        ? JSON.stringify(properties)
        : toExportCellValue(row?.properties ?? ""),
      timestamp: formatRawEventTimestamp(row?.timestamp ?? row?.time),
      ownerId: toExportNumber(row?.ownerId),
    };
  });
}

function buildEventTypeRows(normalizedEvents = []) {
  const totalEvents = normalizedEvents.length || 1;
  const groups = new Map();

  normalizedEvents.forEach((event) => {
    const group = ensureAggregation(groups, event.eventName || "unknown", () => ({
      totalEvents: 0,
      users: new Set(),
      endpoints: new Set(),
      sites: new Set(),
      methods: new Set(),
      sources: new Set(),
      statuses: new Set(),
      responseTimeSum: 0,
      responseTimeCount: 0,
      firstSeen: null,
      lastSeen: null,
    }));

    group.totalEvents += 1;
    if (isFilled(event.userId)) group.users.add(event.userId);
    if (isFilled(event.endpoint)) group.endpoints.add(event.endpoint);
    if (isFilled(event.eventSite)) group.sites.add(event.eventSite);
    if (isFilled(event.method)) group.methods.add(event.method);
    if (isFilled(event.source)) group.sources.add(event.source);
    if (event.statusCode !== null) group.statuses.add(event.statusCode);
    if (event.responseTimeMs !== null) {
      group.responseTimeSum += event.responseTimeMs;
      group.responseTimeCount += 1;
    }
    updateSeenWindow(group, event.timestampDate);
  });

  return Array.from(groups.entries())
    .sort((left, right) => right[1].totalEvents - left[1].totalEvents)
    .map(([eventName, group]) => ({
      Event: eventName,
      "Total Events": group.totalEvents,
      "Share (%)": ((group.totalEvents / totalEvents) * 100).toFixed(2),
      "Unique Users": group.users.size,
      "Unique Endpoints": group.endpoints.size,
      "Unique Sites": group.sites.size,
      Methods: joinUniqueValues(group.methods, 6),
      Sources: joinUniqueValues(group.sources, 6),
      "Status Codes": joinUniqueValues(group.statuses, 6),
      "Avg Response (ms)": group.responseTimeCount > 0
        ? Math.round(group.responseTimeSum / group.responseTimeCount)
        : "",
      "First Seen": formatExportTimestamp(group.firstSeen),
      "Last Seen": formatExportTimestamp(group.lastSeen),
    }));
}

function buildEndpointRows(normalizedEvents = []) {
  const groups = new Map();

  normalizedEvents.forEach((event) => {
    const endpointKey = pickFirstFilled(event.endpoint, "(no endpoint)");
    const siteKey = pickFirstFilled(event.eventSite, event.connectedUrl, event.connectedSite, "Unknown");
    const groupKey = `${siteKey}::${event.endpointType || "Other"}::${endpointKey}`;
    const group = ensureAggregation(groups, groupKey, () => ({
      site: siteKey,
      host: event.host,
      endpoint: endpointKey,
      endpointType: event.endpointType || "",
      endpointUrl: event.endpointUrl,
      totalEvents: 0,
      users: new Set(),
      eventTypes: new Set(),
      methods: new Set(),
      sources: new Set(),
      statuses: new Set(),
      responseTimeSum: 0,
      responseTimeCount: 0,
      firstSeen: null,
      lastSeen: null,
    }));

    group.totalEvents += 1;
    if (isFilled(event.userId)) group.users.add(event.userId);
    if (isFilled(event.eventName)) group.eventTypes.add(event.eventName);
    if (isFilled(event.method)) group.methods.add(event.method);
    if (isFilled(event.source)) group.sources.add(event.source);
    if (event.statusCode !== null) group.statuses.add(event.statusCode);
    if (!group.host && isFilled(event.host)) group.host = event.host;
    if (!group.endpointUrl && isFilled(event.endpointUrl)) group.endpointUrl = event.endpointUrl;
    if (event.responseTimeMs !== null) {
      group.responseTimeSum += event.responseTimeMs;
      group.responseTimeCount += 1;
    }
    updateSeenWindow(group, event.timestampDate);
  });

  return Array.from(groups.values())
    .sort((left, right) => right.totalEvents - left.totalEvents)
    .map((group) => ({
      Site: group.site,
      Host: group.host || "",
      Endpoint: group.endpoint,
      "Endpoint Type": group.endpointType,
      "Endpoint URL": group.endpointUrl || "",
      "Total Events": group.totalEvents,
      "Unique Users": group.users.size,
      "Event Types": joinUniqueValues(group.eventTypes, 8),
      Methods: joinUniqueValues(group.methods, 6),
      Sources: joinUniqueValues(group.sources, 6),
      "Status Codes": joinUniqueValues(group.statuses, 6),
      "Avg Response (ms)": group.responseTimeCount > 0
        ? Math.round(group.responseTimeSum / group.responseTimeCount)
        : "",
      "First Seen": formatExportTimestamp(group.firstSeen),
      "Last Seen": formatExportTimestamp(group.lastSeen),
    }));
}

function buildUserRows(normalizedEvents = []) {
  const groups = new Map();

  normalizedEvents.forEach((event) => {
    const group = ensureAggregation(groups, event.userId || "anonymous", () => ({
      userId: event.userId || "anonymous",
      ownerEmails: new Set(),
      totalEvents: 0,
      eventTypes: new Set(),
      endpoints: new Set(),
      sites: new Set(),
      methods: new Set(),
      sources: new Set(),
      eventTypeCounts: new Map(),
      endpointCounts: new Map(),
      firstSeen: null,
      lastSeen: null,
    }));

    group.totalEvents += 1;
    if (isFilled(event.ownerEmail)) group.ownerEmails.add(event.ownerEmail);
    if (isFilled(event.eventName)) group.eventTypes.add(event.eventName);
    if (isFilled(event.endpoint)) group.endpoints.add(event.endpoint);
    if (isFilled(event.eventSite)) group.sites.add(event.eventSite);
    if (isFilled(event.method)) group.methods.add(event.method);
    if (isFilled(event.source)) group.sources.add(event.source);
    addCount(group.eventTypeCounts, event.eventName);
    addCount(group.endpointCounts, event.endpoint);
    updateSeenWindow(group, event.timestampDate);
  });

  return Array.from(groups.values())
    .sort((left, right) => right.totalEvents - left.totalEvents)
    .map((group) => ({
      "User ID": group.userId,
      "Owner Email": joinUniqueValues(group.ownerEmails, 4),
      "Total Events": group.totalEvents,
      "Unique Endpoints": group.endpoints.size,
      "Unique Sites": group.sites.size,
      "Event Types": joinUniqueValues(group.eventTypes, 8),
      "Top Event": getTopCountLabel(group.eventTypeCounts),
      "Top Endpoint": getTopCountLabel(group.endpointCounts),
      Methods: joinUniqueValues(group.methods, 6),
      Sources: joinUniqueValues(group.sources, 6),
      "First Seen": formatExportTimestamp(group.firstSeen),
      "Last Seen": formatExportTimestamp(group.lastSeen),
    }));
}

function buildSiteRows(normalizedEvents = []) {
  const groups = new Map();

  normalizedEvents.forEach((event) => {
    const siteKey = pickFirstFilled(event.eventSite, event.connectedUrl, event.connectedSite, "Unknown");
    const group = ensureAggregation(groups, siteKey, () => ({
      site: siteKey,
      host: event.host,
      ownerEmails: new Set(),
      totalEvents: 0,
      users: new Set(),
      endpoints: new Set(),
      eventTypes: new Set(),
      sources: new Set(),
      pageViews: 0,
      errors: 0,
      firstSeen: null,
      lastSeen: null,
    }));

    group.totalEvents += 1;
    if (!group.host && isFilled(event.host)) group.host = event.host;
    if (isFilled(event.ownerEmail)) group.ownerEmails.add(event.ownerEmail);
    if (isFilled(event.userId)) group.users.add(event.userId);
    if (isFilled(event.endpoint)) group.endpoints.add(event.endpoint);
    if (isFilled(event.eventName)) group.eventTypes.add(event.eventName);
    if (isFilled(event.source)) group.sources.add(event.source);
    if (event.eventName === "page_view") group.pageViews += 1;
    if (event.eventName === "error") group.errors += 1;
    updateSeenWindow(group, event.timestampDate);
  });

  return Array.from(groups.values())
    .sort((left, right) => right.totalEvents - left.totalEvents)
    .map((group) => ({
      Site: group.site,
      Host: group.host || "",
      "Owner Email": joinUniqueValues(group.ownerEmails, 4),
      "Total Events": group.totalEvents,
      "Unique Users": group.users.size,
      "Unique Endpoints": group.endpoints.size,
      "Page Views": group.pageViews,
      Errors: group.errors,
      "Event Types": joinUniqueValues(group.eventTypes, 8),
      Sources: joinUniqueValues(group.sources, 6),
      "First Seen": formatExportTimestamp(group.firstSeen),
      "Last Seen": formatExportTimestamp(group.lastSeen),
    }));
}

function buildTimelineRows(normalizedEvents = [], dateRangeKey) {
  const rangeConfig = getRangeConfig(dateRangeKey);
  const bucketType = rangeConfig.bucketType;
  const groups = new Map();

  normalizedEvents.forEach((event) => {
    const bucketKey = pickFirstFilled(
      bucketType === "hour" ? event.hourBucket : event.dayBucket,
      "Unknown time"
    );
    const group = ensureAggregation(groups, bucketKey, () => ({
      bucket: bucketKey,
      totalEvents: 0,
      users: new Set(),
      pageViews: 0,
      errors: 0,
      eventTypes: new Set(),
      eventTypeCounts: new Map(),
      endpointCounts: new Map(),
      firstSeen: null,
      lastSeen: null,
      sortValue: event.timestampMs ?? Number.MAX_SAFE_INTEGER,
    }));

    group.totalEvents += 1;
    if (isFilled(event.userId)) group.users.add(event.userId);
    if (event.eventName === "page_view") group.pageViews += 1;
    if (event.eventName === "error") group.errors += 1;
    if (isFilled(event.eventName)) group.eventTypes.add(event.eventName);
    addCount(group.eventTypeCounts, event.eventName);
    addCount(group.endpointCounts, event.endpoint);
    updateSeenWindow(group, event.timestampDate);
  });

  return Array.from(groups.values())
    .sort((left, right) => {
      if (left.sortValue !== right.sortValue) return left.sortValue - right.sortValue;
      return String(left.bucket).localeCompare(String(right.bucket));
    })
    .map((group) => ({
      "Time Bucket": group.bucket,
      Granularity: bucketType === "hour" ? "Hour" : "Day",
      "Total Events": group.totalEvents,
      "Unique Users": group.users.size,
      "Page Views": group.pageViews,
      Errors: group.errors,
      "Event Types": joinUniqueValues(group.eventTypes, 8),
      "Top Event": getTopCountLabel(group.eventTypeCounts),
      "Top Endpoint": getTopCountLabel(group.endpointCounts),
      "First Event": formatExportTimestamp(group.firstSeen),
      "Last Event": formatExportTimestamp(group.lastSeen),
    }));
}

function buildEventRows(normalizedEvents = []) {
  return normalizedEvents.map((event) => ({
    "Event ID": toExportCellValue(event.eventId),
    "Occurred At": event.timestampLabel,
    "Occurred Date": event.dateLabel,
    "Occurred Time": event.timeLabel,
    Weekday: event.weekdayLabel,
    Hour: event.hourOfDay,
    "UTC Timestamp": event.isoTimestamp,
    Event: event.eventName,
    Action: event.action,
    "User ID": event.userId,
    "Owner Email": event.ownerEmail,
    "Connected Site": event.connectedSite,
    "Connected URL": event.connectedUrl,
    "Event Site": event.eventSite,
    Host: event.host,
    Endpoint: event.endpoint,
    "Endpoint Type": event.endpointType,
    "Endpoint URL": event.endpointUrl,
    Page: event.page,
    "Request URL": event.requestUrl,
    "Full URL": event.fullUrl,
    "Link/Href": event.linkUrl,
    "Resource URL": event.resourceUrl,
    Source: event.source,
    Method: event.method,
    "Status Code": toExportNumber(event.statusCode),
    "Response Time (ms)": toExportNumber(event.responseTimeMs),
    Severity: event.severity,
    Issue: event.issue,
    Kind: event.kind,
    Message: event.message,
    Country: event.country,
    Device: event.device,
    Browser: event.browser,
    Referrer: event.referrer,
    "Session ID": event.sessionId,
    Title: event.title,
    Tag: event.tag,
    Text: event.text,
    Value: event.value,
    Count: toExportNumber(event.count),
    "Internal Links": toExportNumber(event.internalLinks),
    "External Links": toExportNumber(event.externalLinks),
    Forms: toExportNumber(event.forms),
    Images: toExportNumber(event.images),
    Scripts: toExportNumber(event.scripts),
    Stylesheets: toExportNumber(event.stylesheets),
    Headings: toExportNumber(event.headings),
    "Word Count": toExportNumber(event.wordCount),
    "Issue Count": toExportNumber(event.issueCount),
    Technologies: event.technologies,
    "Meta Description": event.metaDescription,
    "Properties JSON": event.propertiesJson,
  }));
}

function buildConnectedSitePageRows(sitePages = []) {
  return sitePages.map((row) => ({
    Page: row.page || "",
    Title: row.title || "",
    URL: row.fullUrl || "",
    "Internal Links": toExportNumber(row.internalLinks),
    "Response Time (ms)": toExportNumber(row.responseTimeMs),
    "Issue Count": toExportNumber(row.issueCount),
  }));
}

export async function exportDashboardExcel({
  dateRangeKey,
  siteLabel,
  events,
}) {
  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default || xlsxModule;
  const workbook = XLSX.utils.book_new();
  createSheet(workbook, XLSX, "Events", buildRawEventRows(events), {
    id: "",
    eventName: "No events",
    userId: "",
    country: "",
    device: "",
    properties: "",
    timestamp: "",
    ownerId: "",
  });

  const workbookArray = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const blob = new Blob([workbookArray], { type: EXCEL_CONTENT_TYPE });
  return {
    blob,
    filename: `${buildDashboardExportFileStem(siteLabel, dateRangeKey)}.xlsx`,
  };
}

export async function exportDashboardPdf(element, { filename, title, subtitle } = {}) {
  if (!element) {
    throw new Error("Dashboard export element was not found.");
  }

  const [html2canvasModule, jspdfModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const html2canvas = html2canvasModule.default || html2canvasModule;
  const { jsPDF } = jspdfModule;
  const backgroundColor =
    typeof window !== "undefined"
      ? window.getComputedStyle(document.body).backgroundColor || "#0b1118"
      : "#0b1118";

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const headerHeight = title || subtitle ? 12 : 0;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  if (title) {
    pdf.setFontSize(14);
    pdf.text(title, margin, margin);
  }

  if (subtitle) {
    pdf.setFontSize(9);
    pdf.text(subtitle, margin, margin + 5);
  }

  const firstPageTop = margin + headerHeight;
  const firstPageUsableHeight = pageHeight - firstPageTop - margin;
  const laterPageTop = margin;
  const laterPageUsableHeight = pageHeight - laterPageTop - margin;
  let renderedHeight = 0;

  pdf.addImage(imgData, "PNG", margin, firstPageTop, imageWidth, imageHeight);
  renderedHeight += firstPageUsableHeight;

  while (renderedHeight < imageHeight) {
    pdf.addPage();
    const position = laterPageTop - renderedHeight;
    pdf.addImage(imgData, "PNG", margin, position, imageWidth, imageHeight);
    renderedHeight += laterPageUsableHeight;
  }

  pdf.save(filename || "dashboard-export.pdf");
}
