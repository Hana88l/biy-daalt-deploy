import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Globe, ScanSearch, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

function formatDateTime(value) {
  if (!value) return "Not analyzed yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not analyzed yet";

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHealthLabel(page) {
  return Number(page?.issueCount || 0) > 0 ? `${page.issueCount} issues` : "Healthy";
}

export default function ConnectedSitePanel({
  snapshot,
  isLoading,
  liveTrackingDetected = false,
}) {
  const activeSite = snapshot?.activeSite || snapshot?.site || null;
  const summary = snapshot?.summary || null;
  const pages = Array.isArray(snapshot?.pages) ? snapshot.pages : [];

  if (!isLoading && !activeSite) return null;

  return (
    <Card glow className="mb-3">
      <CardHeader>
        <CardTitle>Connected Site</CardTitle>
        {isLoading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span
            className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
              liveTrackingDetected
                ? "text-accent-green border-accent-green/25 bg-accent-green/10"
                : "text-accent-cyan border-accent-cyan/25 bg-accent-cyan/10"
            }`}
          >
            {liveTrackingDetected ? "Live Tracking" : "URL Monitoring"}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-accent-cyan shrink-0" />
                  <p className="text-sm text-text-primary truncate">
                    {activeSite?.name || activeSite?.url || "Connected site"}
                  </p>
                </div>
                {activeSite?.url && (
                  <p className="text-[11px] text-text-secondary font-mono mt-1 break-all">
                    {activeSite.url}
                  </p>
                )}
                <p className="text-[11px] text-text-muted mt-1">
                  Last analyzed: {formatDateTime(activeSite?.lastAnalyzedAt)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeSite?.url && (
                  <a
                    href={activeSite.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-all"
                  >
                    <ExternalLink size={12} />
                    Open Site
                  </a>
                )}
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bg-border bg-bg-elevated text-text-secondary text-xs hover:text-text-primary hover:border-accent-cyan/20 transition-all"
                >
                  <Settings2 size={12} />
                  Manage Site
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { label: "Pages Scanned", value: summary?.pagesScanned ?? "-" },
                { label: "Issues Found", value: summary?.issuesFound ?? "-" },
                { label: "Internal Links", value: summary?.internalLinks ?? "-" },
                {
                  label: "Avg Response",
                  value: summary ? `${summary.averageResponseTimeMs || 0}ms` : "-",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2"
                >
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    {item.label}
                  </p>
                  <p className="text-lg text-text-primary mt-1">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-bg-border overflow-hidden">
              <div className="px-3 py-2 border-b border-bg-border bg-bg-base flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ScanSearch size={12} className="text-text-muted" />
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    Top Discovered Pages
                  </p>
                </div>
                <span className="text-[11px] text-text-muted">
                  {pages.length > 0 ? `${pages.length} pages shown` : "No scan pages yet"}
                </span>
              </div>

              {pages.length > 0 ? (
                <div className="divide-y divide-bg-border">
                  {pages.map((page) => (
                    <div
                      key={`${page.page}-${page.fullUrl || "page"}`}
                      className="px-3 py-2 flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        {page.fullUrl ? (
                          <a
                            href={page.fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-text-primary font-mono truncate hover:text-accent-cyan transition-colors inline-block max-w-full"
                            title={page.fullUrl}
                          >
                            {page.page}
                          </a>
                        ) : (
                          <p className="text-xs text-text-primary font-mono truncate">
                            {page.page}
                          </p>
                        )}
                        {page.title && (
                          <p className="text-[11px] text-text-muted truncate mt-0.5">
                            {page.title}
                          </p>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">
                        {page.internalLinks || 0} links
                      </div>
                      <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">
                        {page.responseTimeMs || 0}ms
                      </div>
                      <div
                        className={`text-[11px] font-mono whitespace-nowrap ${
                          Number(page?.issueCount || 0) > 0
                            ? "text-accent-red"
                            : "text-accent-green"
                        }`}
                      >
                        {getHealthLabel(page)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-xs text-text-muted">
                  This site has not been scanned yet. Open Settings and run Analyze if you want to load page-level details.
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
