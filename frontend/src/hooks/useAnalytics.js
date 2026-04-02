import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchWithAuth, STREAM_URL } from '../utils/api';
import { STORAGE_KEY } from '../context/AuthContext';

const ALERT_RULES_STORAGE_KEY = 'qs_alert_rules';

const DEFAULT_KPIS = {
  totalEvents: 0,
  totalUsers: 0,
  pageViews: 0,
  errors: 0,
  connectedSite: false,
  liveTrackingDetected: false,
  siteMode: false,
  pagesScanned: 0,
  internalLinks: 0,
  averageResponseTimeMs: 0,
  issuesFound: 0,
  totalAccounts: 0,
  newSignups: 0,
  authAttempts5m: 0,
  authErrors5m: 0,
  authErrorRate5m: 0,
  bounceRate: 0,
  errorRate: 0,
};

const ALERT_METRIC_OPTIONS = [
  { value: 'error_rate', label: 'Error rate' },
  { value: 'errors', label: 'Errors' },
  { value: 'total_events', label: 'Total events' },
  { value: 'unique_users', label: 'Unique users' },
  { value: 'page_views', label: 'Page views' },
];

const ALERT_OPERATOR_OPTIONS = [
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'equals', label: 'equals' },
];

const ALERT_CHANNEL_OPTIONS = ['Email', 'Slack', 'Webhook'];

const DEFAULT_ALERT_RULES = [
  {
    id: 'rule-error-rate-default',
    metric: 'error_rate',
    operator: 'greater_than',
    threshold: 0,
    channel: 'Email',
    enabled: true,
  },
];

const ALERT_METRIC_CONFIG = {
  error_rate: {
    label: 'Error rate',
    type: 'error',
    unit: '%',
    getValue: (kpis) => Number(kpis?.errorRate || 0),
  },
  errors: {
    label: 'Errors',
    type: 'error',
    getValue: (kpis) => Number(kpis?.errors || 0),
  },
  total_events: {
    label: 'Total events',
    type: 'info',
    getValue: (kpis) => Number(kpis?.totalEvents || 0),
  },
  unique_users: {
    label: 'Unique users',
    type: 'warning',
    getValue: (kpis) => Number(kpis?.totalUsers || 0),
  },
  page_views: {
    label: 'Page views',
    type: 'info',
    getValue: (kpis) => Number(kpis?.pageViews || 0),
  },
};

function mapEventToFrontend(backendEvent) {
  return {
    id: backendEvent.id || Math.random().toString(36),
    event: backendEvent.eventName,
    page: backendEvent.properties?.url || '/',
    userId: backendEvent.userId || 'anonymous',
    country: backendEvent.properties?.country || 'Unknown',
    time: new Date(backendEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

function mapVisitorPoint(row) {
  const timestamp = row?.timestamp || row?.date || null;
  const pointDate = timestamp ? new Date(timestamp) : null;

  return {
    timestamp,
    timeLabel: pointDate
      ? pointDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : '',
    fullLabel: pointDate
      ? pointDate.toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '',
    visitors: Number(row?.visitors || row?.count || 0),
    pageViews: Number(row?.pageViews || 0),
  };
}

function normalizeKpis(input) {
  return {
    ...DEFAULT_KPIS,
    ...(input || {}),
    totalEvents: Number(input?.totalEvents || 0),
    totalUsers: Number(input?.totalUsers || 0),
    pageViews: Number(input?.pageViews || 0),
    errors: Number(input?.errors || 0),
    connectedSite: Boolean(input?.connectedSite),
    liveTrackingDetected: Boolean(input?.liveTrackingDetected),
    siteMode: Boolean(input?.siteMode),
    pagesScanned: Number(input?.pagesScanned || 0),
    internalLinks: Number(input?.internalLinks || 0),
    averageResponseTimeMs: Number(input?.averageResponseTimeMs || 0),
    issuesFound: Number(input?.issuesFound || 0),
    totalAccounts: Number(input?.totalAccounts || 0),
    newSignups: Number(input?.newSignups || 0),
    authAttempts5m: Number(input?.authAttempts5m || 0),
    authErrors5m: Number(input?.authErrors5m || 0),
    authErrorRate5m: Number(input?.authErrorRate5m || 0),
    bounceRate: Number(input?.bounceRate || 0),
    errorRate: Number(input?.errorRate || 0),
  };
}

function normalizeAlertRule(rule) {
  const threshold = Number(rule?.threshold || 0);
  return {
    id: rule?.id || `rule-${Math.random().toString(36).slice(2, 10)}`,
    metric: rule?.metric || ALERT_METRIC_OPTIONS[0].value,
    operator: rule?.operator || ALERT_OPERATOR_OPTIONS[0].value,
    threshold: Number.isFinite(threshold) ? threshold : 0,
    channel: rule?.channel || ALERT_CHANNEL_OPTIONS[0],
    enabled: rule?.enabled !== false,
  };
}

function loadAlertRules() {
  if (typeof window === 'undefined') return DEFAULT_ALERT_RULES;

  try {
    const raw = window.localStorage.getItem(ALERT_RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_RULES;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ALERT_RULES;

    return parsed.map(normalizeAlertRule);
  } catch {
    return DEFAULT_ALERT_RULES;
  }
}

function compareRule(value, operator, threshold) {
  switch (operator) {
    case 'less_than':
      return value < threshold;
    case 'equals':
      return value === threshold;
    case 'greater_than':
    default:
      return value > threshold;
  }
}

function formatMetricValue(value, unit) {
  if (unit === '%') return `${Number(value).toFixed(2)}%`;
  return Number(value).toLocaleString();
}

function buildAlertMessage(rule, config, currentValue) {
  const operatorLabel = ALERT_OPERATOR_OPTIONS.find((item) => item.value === rule.operator)?.label || rule.operator;
  const current = formatMetricValue(currentValue, config.unit);
  const threshold = formatMetricValue(rule.threshold, config.unit);
  return `${config.label} is ${current} (${operatorLabel} ${threshold}) via ${rule.channel}`;
}

function buildAlerts(kpis, alertRules) {
  const now = new Date();
  const nextAlerts = alertRules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => {
      const config = ALERT_METRIC_CONFIG[rule.metric];
      if (!config) return null;

      const currentValue = config.getValue(kpis);
      if (!compareRule(currentValue, rule.operator, rule.threshold)) return null;

      return {
        id: `alert-${rule.id}`,
        type: config.type,
        message: buildAlertMessage(rule, config, currentValue),
        time: `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        ruleId: rule.id,
        source: 'rule',
      };
    })
    .filter(Boolean);

  if (nextAlerts.length > 0) return nextAlerts;

  return [
    {
      id: 'alert-all-clear',
      type: 'info',
      message: 'All systems operational. No active alerts.',
      time: `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      source: 'system',
    },
  ];
}

export function useAnalytics() {
  const [visitors, setVisitors] = useState([]);
  const [events, setEvents] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [deviceData, setDeviceData] = useState([]);
  const [countryData, setCountryData] = useState([]);
  const [kpis, setKpis] = useState(DEFAULT_KPIS);
  const [alertRules, setAlertRules] = useState(loadAlertRules);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [liveCount, setLiveCount] = useState(0);
  const [dateRange, setDateRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const fetchAllRef = useRef(null);
  const dateRangeRef = useRef('7d');
  const kpisRef = useRef(DEFAULT_KPIS);
  const dashboardRefreshTimeoutRef = useRef(null);

  const computedAlerts = useMemo(() => buildAlerts(kpis, alertRules), [kpis, alertRules]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ALERT_RULES_STORAGE_KEY, JSON.stringify(alertRules));
  }, [alertRules]);

  useEffect(() => {
    setDismissedAlertIds((prev) => prev.filter((id) => computedAlerts.some((alert) => alert.id === id)));
  }, [computedAlerts]);

  const alerts = useMemo(
    () => computedAlerts.filter((alert) => !dismissedAlertIds.includes(alert.id)),
    [computedAlerts, dismissedAlertIds]
  );

  const scheduleDashboardRefresh = useCallback((delay = 1000) => {
    clearTimeout(dashboardRefreshTimeoutRef.current);
    dashboardRefreshTimeoutRef.current = setTimeout(() => {
      fetchAllRef.current?.(dateRangeRef.current);
    }, delay);
  }, []);

  const loadVisitorsSeries = useCallback(async () => {
    try {
      const visitorsRes = await fetchWithAuth('/analytics/visitors?range=24h').catch(() => null);
      if (visitorsRes && Array.isArray(visitorsRes)) {
        setVisitors(visitorsRes.map(mapVisitorPoint));
      }
    } catch (err) {
      console.error('Failed to load visitors series', err);
    }
  }, []);

  const fetchAll = useCallback(async (range) => {
    setLoading(true);
    try {
      const query = `?range=${range}`;
      const [
        kpisRes,
        hourlyRes,
        funnelRes,
        pagesRes,
        devicesRes,
        countriesRes,
        eventsRes
      ] = await Promise.all([
        fetchWithAuth(`/analytics/kpis${query}`).catch(() => null),
        fetchWithAuth(`/analytics/hourly${query}`).catch(() => []),
        fetchWithAuth(`/analytics/funnel${query}`).catch(() => []),
        fetchWithAuth(`/analytics/pages${query}`).catch(() => []),
        fetchWithAuth(`/analytics/devices${query}`).catch(() => []),
        fetchWithAuth(`/analytics/countries${query}`).catch(() => []),
        fetchWithAuth(`/analytics/events${query}`).catch(() => [])
      ]);

      if (kpisRes) {
        setKpis(normalizeKpis(kpisRes));
      }

      if (hourlyRes && Array.isArray(hourlyRes)) {
        setHourly(hourlyRes.map((row) => ({
          hour: row.hour !== undefined ? `${row.hour}:00` : row.hour,
          events: row.events !== undefined ? row.events : (row.count || 0),
          errors: row.errors !== undefined ? row.errors : 0,
        })));
      }

      if (funnelRes && Array.isArray(funnelRes)) setFunnel(funnelRes);

      if (pagesRes && Array.isArray(pagesRes)) {
        const normalizeTopPageValue = (primary, secondary, tertiary, fallback = 'n/a') =>
          primary || secondary || tertiary || fallback;

        setTopPages(pagesRes.map((row) => ({
          page: row.page || '/',
          href: row.fullUrl || row.href || null,
          title: row.title || '',
          statusCode: row.statusCode || null,
          views: Number(row.views || 0),
          status: normalizeTopPageValue(row.status, row.bounce, row.health),
          avgTime: normalizeTopPageValue(row.avgTime, row.avg, row.load),
          bounce: normalizeTopPageValue(row.status, row.bounce, row.health),
          avg: normalizeTopPageValue(row.avgTime, row.avg, row.load),
          health: row.health || row.status || null,
          load: row.load || row.avgTime || null,
        })));
      }

      const deviceColors = ['#00E5FF', '#00BFA5', '#FFB300', '#FF5252', '#7C4DFF'];
      if (devicesRes && Array.isArray(devicesRes)) {
        const total = devicesRes.reduce((sum, item) => sum + (item.count || item.value || 0), 0) || 1;
        setDeviceData(devicesRes.map((item, index) => ({
          name: item.name || item.device || 'Unknown',
          value: item.value !== undefined ? item.value : Math.round(((item.count || 0) / total) * 100),
          color: item.color || deviceColors[index % deviceColors.length],
        })));
      }

      if (countriesRes && Array.isArray(countriesRes)) setCountryData(countriesRes);
      if (eventsRes && Array.isArray(eventsRes)) setEvents(eventsRes.map(mapEventToFrontend));
      await loadVisitorsSeries();
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  }, [loadVisitorsSeries]);

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  useEffect(() => {
    kpisRef.current = kpis;
  }, [kpis]);

  useEffect(() => {
    fetchAll(dateRange);
  }, [dateRange, fetchAll]);

  useEffect(() => {
    loadVisitorsSeries();
    const intervalId = setInterval(loadVisitorsSeries, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadVisitorsSeries]);

  useEffect(() => {
    if (!kpis.siteMode) return;

    const intervalId = setInterval(() => {
      fetchAll(dateRange);
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [kpis.siteMode, fetchAll, dateRange]);

  useEffect(() => {
    let raw = localStorage.getItem(STORAGE_KEY);
    let token = '';
    if (raw) {
      try {
        token = JSON.parse(raw).token;
      } catch {
        token = '';
      }
    }

    if (!token) return;

    const eventSource = new EventSource(`${STREAM_URL}?token=${token}`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'NEW_EVENT' && data.payload) {
          const eventName = data.payload?.eventName;
          const isHeartbeat = eventName === 'heartbeat';
          const isSiteScanEvent = data.payload?.properties?.source === 'site_scan';
          const currentKpis = normalizeKpis(kpisRef.current);
          const ignoreForLiveDashboard = isSiteScanEvent && currentKpis.connectedSite && currentKpis.liveTrackingDetected;

          if (ignoreForLiveDashboard) {
            scheduleDashboardRefresh(1200);
            return;
          }

          if (!isHeartbeat) {
            setEvents((prev) => {
              const mappedEvent = mapEventToFrontend({ ...data.payload, id: Math.random().toString(36) });
              return [mappedEvent, ...prev].slice(0, 50);
            });
          }

          setLiveCount((prev) => prev + 1);

          if (!isHeartbeat) {
            setKpis((prev) => {
              const base = normalizeKpis(prev);
              const isPageView = eventName === 'page_view';
              const isError = eventName === 'error';
              const isLiveTrackedPageView = isPageView && !isSiteScanEvent;
              const nextTotalEvents = base.totalEvents + 1;
              const nextErrors = base.errors + (isError ? 1 : 0);

              return {
                ...base,
                liveTrackingDetected: base.liveTrackingDetected || isLiveTrackedPageView,
                siteMode: isLiveTrackedPageView ? false : base.siteMode,
                totalEvents: nextTotalEvents,
                pageViews: base.pageViews + (isPageView ? 1 : 0),
                errors: nextErrors,
                errorRate: nextTotalEvents > 0 ? (nextErrors / nextTotalEvents) * 100 : 0,
              };
            });
          }

          const funnelStages = ['page_view', 'click', 'signup', 'purchase'];
          if (funnelStages.includes(eventName)) {
            setFunnel((prev) => {
              const base = Array.isArray(prev) && prev.length
                ? prev
                : funnelStages.map((stage) => ({ stage, count: 0 }));

              return base.map((item) =>
                item.stage === eventName
                  ? { ...item, count: (item.count || 0) + 1 }
                  : item
              );
            });
          }

          if (!isHeartbeat && ['page_view', 'click', 'signup', 'purchase', 'error'].includes(eventName)) {
            scheduleDashboardRefresh(isSiteScanEvent ? 1200 : 800);
          }
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    return () => {
      eventSource.close();
      clearTimeout(dashboardRefreshTimeoutRef.current);
    };
  }, [scheduleDashboardRefresh]);

  const refreshData = useCallback(() => {
    fetchAll(dateRange);
  }, [fetchAll, dateRange]);

  const dismissAlert = useCallback((id) => {
    setDismissedAlertIds((prev) => [...prev, id]);
  }, []);

  const changeDateRange = useCallback((range) => {
    setDateRange(range);
  }, []);

  const createAlertRule = useCallback((input) => {
    const nextRule = normalizeAlertRule({
      ...input,
      id: `rule-${Date.now().toString(36)}`,
    });

    setAlertRules((prev) => [...prev, nextRule]);
    return nextRule;
  }, []);

  const removeAlertRule = useCallback((ruleId) => {
    setAlertRules((prev) => {
      const next = prev.filter((rule) => rule.id !== ruleId);
      return next.length > 0 ? next : DEFAULT_ALERT_RULES;
    });
    setDismissedAlertIds((prev) => prev.filter((id) => id !== `alert-${ruleId}`));
  }, []);

  return {
    visitors,
    events,
    hourly,
    funnel,
    topPages,
    deviceData,
    countryData,
    kpis,
    alerts,
    alertRules,
    alertMetricOptions: ALERT_METRIC_OPTIONS,
    alertOperatorOptions: ALERT_OPERATOR_OPTIONS,
    alertChannelOptions: ALERT_CHANNEL_OPTIONS,
    liveCount,
    dateRange,
    loading,
    refreshData,
    dismissAlert,
    changeDateRange,
    createAlertRule,
    removeAlertRule,
  };
}

export function useRealtime(
  initialTotalEvents = 0,
  initialAuthErrors = 0,
  initialAuthAttempts = 0,
  connectedSite = false,
  liveTrackingDetected = false
) {
  const [eventsPerSec, setEventsPerSec] = useState(0);
  const [totalEvents, setTotalEvents] = useState(initialTotalEvents || 0);
  const [authAttempts5m, setAuthAttempts5m] = useState(initialAuthAttempts || 0);
  const [authErrors5m, setAuthErrors5m] = useState(initialAuthErrors || 0);
  const [liveCount, setLiveCount] = useState(0);

  const eventCounterRef = useRef(0);
  const totalLiveRef = useRef(0);
  const baseTotalRef = useRef(initialTotalEvents || 0);
  const rollingRef = useRef([]);
  const modeRef = useRef({ connectedSite: Boolean(connectedSite), liveTrackingDetected: Boolean(liveTrackingDetected) });

  useEffect(() => {
    baseTotalRef.current = initialTotalEvents || 0;
    setTotalEvents(baseTotalRef.current + totalLiveRef.current);
  }, [initialTotalEvents]);

  useEffect(() => {
    setAuthErrors5m(initialAuthErrors || 0);
  }, [initialAuthErrors]);

  useEffect(() => {
    setAuthAttempts5m(initialAuthAttempts || 0);
  }, [initialAuthAttempts]);

  useEffect(() => {
    modeRef.current = {
      connectedSite: Boolean(connectedSite),
      liveTrackingDetected: Boolean(liveTrackingDetected),
    };
  }, [connectedSite, liveTrackingDetected]);

  useEffect(() => {
    let cancelled = false;

    const loadRealtimeSummary = async () => {
      try {
        const summary = await fetchWithAuth('/analytics/realtime-summary');
        if (cancelled || !summary) return;

        setAuthAttempts5m(Number(summary.authAttempts5m || 0));
        setAuthErrors5m(Number(summary.authErrors5m || 0));
      } catch {
        // Keep the last known values if polling fails momentarily.
      }
    };

    loadRealtimeSummary();
    const intervalId = setInterval(loadRealtimeSummary, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let raw = localStorage.getItem(STORAGE_KEY);
    let token = '';
    if (raw) {
      try {
        token = JSON.parse(raw).token;
      } catch {
        token = '';
      }
    }
    if (!token) return;

    const eventSource = new EventSource(`${STREAM_URL}?token=${token}`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'NEW_EVENT') {
          const payload = data.payload || {};
          const isHeartbeat = payload.eventName === 'heartbeat';
          const isSiteScanEvent = payload?.properties?.source === 'site_scan';
          const shouldIgnoreEvent = isSiteScanEvent && modeRef.current.connectedSite && modeRef.current.liveTrackingDetected;
          const ts = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();

          if (!isHeartbeat && !shouldIgnoreEvent) {
            eventCounterRef.current += 1;
            totalLiveRef.current += 1;
            setTotalEvents(baseTotalRef.current + totalLiveRef.current);
          }

          if (!shouldIgnoreEvent) {
            rollingRef.current.push({
              ts,
              isError: payload.eventName === 'error',
              userId: payload.userId || 'anonymous',
              isHeartbeat,
            });
          }
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    const interval = setInterval(() => {
      const now = Date.now();
      const window5m = now - 5 * 60 * 1000;
      const window60s = now - 60 * 1000;

      const next = rollingRef.current.filter((event) => event.ts >= window5m);
      rollingRef.current = next;

      const liveUsers = new Set(next.filter((event) => event.ts >= window60s).map((event) => event.userId));
      setLiveCount(liveUsers.size);

      setEventsPerSec(eventCounterRef.current);
      eventCounterRef.current = 0;
    }, 1000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, []);

  return { eventsPerSec, totalEvents, authAttempts5m, authErrors5m, liveCount };
}
