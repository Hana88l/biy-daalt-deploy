import React, { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/dashboard/KPICard";
import VisitorChart from "../components/charts/VisitorChart";
import DeviceChart from "../components/charts/DeviceChart";
import HourlyChart from "../components/charts/HourlyChart";
import FunnelChart from "../components/charts/FunnelChart";
import TopPages from "../components/dashboard/TopPages";
import EventStream from "../components/dashboard/EventStream";
import CountryList from "../components/dashboard/CountryList";
import AlertsPanel from "../components/dashboard/AlertsPanel";
import ConnectedSitePanel from "../components/dashboard/ConnectedSitePanel";
import { useAnalyticsContext } from "../context/AnalyticsContext";
import { fetchWithAuth } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import {
  exportDashboardExcel,
} from "../utils/dashboardExport";

export default function Overview() {
  const {
    kpis,
    visitors,
    hourly,
    funnel,
    topPages,
    deviceData,
    countryData,
    events,
    alerts,
    dismissAlert,
    dateRange,
    loading: isLoading,
  } = useAnalyticsContext();

  const [exportingType, setExportingType] = useState("");
  const [siteSnapshot, setSiteSnapshot] = useState(null);
  const [isLoadingSiteSnapshot, setIsLoadingSiteSnapshot] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.email === "admin@quantum.com";
  const connectedSite = !isAdmin && Boolean(kpis.connectedSite || user?.siteUrl);
  const liveTrackingDetected = connectedSite && Boolean(kpis.liveTrackingDetected);
  const siteMode = connectedSite && !liveTrackingDetected;

  const rangeLabelMap = {
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  };
  const rangeLabel = rangeLabelMap[dateRange] || "Last 7 days";
  const connectedSiteLabel = user?.siteName || user?.siteUrl || "Connected site";
  const dashboardLabel = connectedSite ? connectedSiteLabel : "Your site";
  const analyzedAtLabel = user?.lastAnalyzedAt
    ? new Date(user.lastAnalyzedAt).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  useEffect(() => {
    let cancelled = false;

    const fallbackSnapshot =
      user?.activeSite || user?.siteUrl
        ? {
            activeSite: user?.activeSite || {
              url: user?.siteUrl || null,
              name: user?.siteName || null,
              lastAnalyzedAt: user?.lastAnalyzedAt || null,
            },
            summary: null,
            pages: [],
          }
        : null;

    async function loadConnectedSiteSnapshot() {
      if (!connectedSite || isAdmin) {
        setSiteSnapshot(null);
        setIsLoadingSiteSnapshot(false);
        return;
      }

      setIsLoadingSiteSnapshot(true);

      try {
        const response = await fetchWithAuth("/analytics/site");
        if (!cancelled) {
          setSiteSnapshot(response || fallbackSnapshot);
        }
      } catch {
        if (!cancelled) {
          setSiteSnapshot(fallbackSnapshot);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSiteSnapshot(false);
        }
      }
    }

    loadConnectedSiteSnapshot();

    return () => {
      cancelled = true;
    };
  }, [
    connectedSite,
    isAdmin,
    user?.activeSite,
    user?.activeSiteId,
    user?.lastAnalyzedAt,
    user?.siteName,
    user?.siteUrl,
  ]);

  const exportSiteLabel =
    siteSnapshot?.activeSite?.name ||
    siteSnapshot?.activeSite?.url ||
    user?.activeSite?.name ||
    user?.activeSite?.url ||
    dashboardLabel;
  const exportSiteUrl =
    siteSnapshot?.activeSite?.url || user?.activeSite?.url || user?.siteUrl || null;
  const exportDisabled =
    Boolean(exportingType) || isLoading || (connectedSite && isLoadingSiteSnapshot);

  const handleExportExcel = async () => {
    if (exportingType) return;
    setExportingType("excel");
    try {
      let exportEvents = events;

      try {
        const fullEvents = await fetchWithAuth(`/analytics/events?range=${dateRange}&limit=all`);
        if (Array.isArray(fullEvents)) {
          exportEvents = fullEvents;
        }
      } catch (eventExportError) {
        console.error("Falling back to in-memory events for Excel export:", eventExportError);
      }

      const { blob, filename } = await exportDashboardExcel({
        dateRangeKey: dateRange,
        dateRangeLabel: rangeLabel,
        siteLabel: exportSiteLabel,
        siteUrl: exportSiteUrl,
        isAdmin,
        liveTrackingDetected,
        siteSnapshot,
        kpis,
        visitors,
        hourly,
        funnel,
        topPages,
        deviceData,
        countryData,
        alerts,
        events: exportEvents,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel export failed:", err);
    } finally {
      setExportingType("");
    }
  };

  return (
    <Layout title="Overview" subtitle={isAdmin ? `${rangeLabel} - All users` : `${rangeLabel} - ${dashboardLabel}`}>
      <div className="flex flex-wrap justify-end gap-2 mb-3">
        <button
          onClick={handleExportExcel}
          disabled={exportDisabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-xs font-500 hover:bg-accent-cyan/20 transition-all disabled:opacity-60 disabled:cursor-default"
        >
          <FileSpreadsheet size={12} />
          {exportingType === "excel" ? "Exporting Excel..." : "Export Excel"}
        </button>
      </div>

      <div>
        {connectedSite && (
          <div
            className={`mb-3 rounded-xl border px-4 py-3 ${
              siteMode
                ? "border-accent-cyan/20 bg-accent-cyan/8"
                : "border-accent-green/20 bg-accent-green/10"
            }`}
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs text-text-primary">
                  {siteMode
                    ? `URL-based monitoring is active for ${connectedSiteLabel}.`
                    : `Live tracking is active for ${connectedSiteLabel}.`}
                </p>
                <p className="text-[11px] text-text-secondary mt-1">
                  {siteMode
                    ? "Manual visits like /upload appear only after live tracking is enabled."
                    : "Real visitor hits are updating the dashboard in near real time."}
                  {analyzedAtLabel ? ` - Last site scan ${analyzedAtLabel}` : ""}
                </p>
              </div>
              <div className="text-[11px] font-mono text-text-secondary">
                Avg response: <span className="text-text-primary">{kpis.averageResponseTimeMs || 0}ms</span>
              </div>
            </div>
          </div>
        )}

        {connectedSite && (
          <ConnectedSitePanel
            snapshot={siteSnapshot}
            isLoading={isLoadingSiteSnapshot}
            liveTrackingDetected={liveTrackingDetected}
          />
        )}

        <div className={`grid grid-cols-2 ${isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-4"} gap-3 mb-4`}>
          <KPICard
            label={siteMode ? "Signals Captured" : "Total Events"}
            value={kpis.totalEvents?.toLocaleString() || "0"}
            isLoading={isLoading}
            color="cyan"
            icon="TrendingUp"
          />
          {isAdmin && (
            <KPICard
              label="Total Users"
              value={kpis.totalAccounts?.toLocaleString() || "0"}
              isLoading={isLoading}
              color="cyan"
              icon="Users"
            />
          )}
          <KPICard
            label={siteMode ? "Pages Scanned" : "Unique Users"}
            value={(siteMode ? kpis.pagesScanned : kpis.totalUsers)?.toLocaleString() || "0"}
            isLoading={isLoading}
            color="cyan"
            icon="Users"
          />
          {isAdmin && (
            <KPICard
              label="New Signups"
              value={kpis.newSignups?.toLocaleString() || "0"}
              isLoading={isLoading}
              color="green"
              icon="TrendingUp"
            />
          )}
          <KPICard
            label={siteMode ? "Internal Links" : "Page Views"}
            value={(siteMode ? kpis.internalLinks : kpis.pageViews)?.toLocaleString() || "0"}
            isLoading={isLoading}
            color="cyan"
            icon="TrendingUp"
          />
          <KPICard
            label={siteMode ? "Issues Found" : "Errors"}
            value={(siteMode ? kpis.issuesFound : kpis.errors)?.toLocaleString() || "0"}
            isLoading={isLoading}
            trend={(siteMode ? kpis.issuesFound : kpis.errors) > 0 ? "down" : "up"}
            color={(siteMode ? kpis.issuesFound : kpis.errors) > 0 ? "red" : "green"}
            icon="AlertCircle"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <VisitorChart
            data={visitors}
            isLoading={isLoading}
            title={siteMode ? "Scan Coverage" : "Visitors & Page Views"}
            primaryLabel={siteMode ? "Pages" : "Visitors"}
            secondaryLabel={siteMode ? "Page Signals" : "Page Views"}
          />
          <DeviceChart data={deviceData} isLoading={isLoading} title={siteMode ? "Page Categories" : "Device Breakdown"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <HourlyChart
            data={hourly}
            isLoading={isLoading}
            title={siteMode ? "Scan Event Volume" : "Hourly Event Volume"}
            valueSuffix={siteMode ? "signals" : "events"}
          />
          <FunnelChart data={funnel} isLoading={isLoading} title={siteMode ? "Site Journey" : "Conversion Funnel"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <TopPages
            data={topPages}
            isLoading={isLoading}
            siteUrl={user?.siteUrl || null}
            title={siteMode ? "Scanned Pages" : "Top Pages"}
            subtitle={siteMode ? "by internal links" : liveTrackingDetected ? "by live views" : "by views"}
            viewsLabel={siteMode ? "Links" : "Views"}
            statusLabel={siteMode ? "Health" : liveTrackingDetected ? "Scan Status" : "Status"}
            loadLabel={siteMode ? "Load" : liveTrackingDetected ? "Last Scan" : "Avg Time"}
            statusMode={siteMode || liveTrackingDetected || isAdmin ? "health" : "percent"}
          />
          <EventStream events={events} isLoading={isLoading} title={siteMode ? "Scan Events" : "Live Events"} liveLabel={siteMode ? "SCAN" : "LIVE"} />
          <div className="space-y-3">
            <CountryList data={countryData} isLoading={isLoading} title={siteMode ? "Health Signals" : "Top Countries"} />
          </div>
          <AlertsPanel alerts={alerts} onDismiss={dismissAlert} isLoading={isLoading} />
        </div>
      </div>
    </Layout>
  );
}
