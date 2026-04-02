import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

export default function FunnelChart({ data, isLoading, title = 'Conversion Funnel' }) {
  const normalizedData = (data || []).map((item) => ({
    stage: item.stage,
    value: item.value !== undefined ? item.value : item.count || 0,
    pct: item.pct !== undefined ? item.pct : item.rate || 0,
  }));
  const max = normalizedData[0]?.value || 1;

  return (
    <Card glow>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-full rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {normalizedData.map((stage, i) => {
              const width = max > 0 ? (stage.value / max) * 100 : 0;
              const colors = ["#00E5FF", "#00CFEE", "#00B9DD", "#009FCA", "#007FA0"];
              const color = colors[i] || "#00E5FF";

              return (
                <div key={stage.stage || i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">{stage.stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text-primary">{stage.value.toLocaleString()}</span>
                      <span className="text-[10px] font-mono text-text-muted">{stage.pct}%</span>
                    </div>
                  </div>
                  <div className="h-5 bg-bg-elevated rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${color}33, ${color}88)`,
                        borderRight: `2px solid ${color}`,
                      }}
                    />
                  </div>
                  {i < normalizedData.length - 1 && (
                    <div className="text-[10px] font-mono text-text-muted text-right mt-0.5">
                      ↓ {stage.value > 0 ? ((normalizedData[i + 1].value / stage.value) * 100).toFixed(1) : 0}% drop-through
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
