import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { cn } from '../../utils/helpers' // Class нэгтгэх туслах функц

// Жижиг Skeleton компонент
const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse bg-white/5 rounded", className)} />
)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const fullLabel = payload[0]?.payload?.fullLabel || label
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-text-secondary font-mono mb-2">{fullLabel}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary capitalize">{p.name}:</span>
          <span className="text-text-primary font-mono font-500">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function VisitorChart({
  data,
  isLoading,
  title = 'Visitors & Page Views',
  rangeLabel = 'Last 24 hours',
  primaryLabel = 'Visitors',
  secondaryLabel = 'Page Views',
}) {
  const gridColor = 'rgb(var(--color-bg-border) / 0.55)'
  const tickColor = 'rgb(var(--color-text-muted) / 1)'
  const cyan = 'rgb(var(--color-accent-cyan) / 1)'
  const green = 'rgb(var(--color-accent-green) / 1)'

  return (
    <Card glow className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {/* Ачаалж байх үед хугацааны тайлбар дээр skeleton харуулна */}
          {isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <div className="flex gap-4 text-xs text-text-secondary">
              <span className="font-mono text-text-muted">{rangeLabel}</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent-cyan" />{primaryLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent-green" />{secondaryLabel}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="w-full h-[220px] flex flex-col justify-between pt-4">
            {/* Графикийн шугамуудыг орлох skeleton-ууд */}
            <div className="space-y-6">
              <Skeleton className="h-[1px] w-full" />
              <Skeleton className="h-[1px] w-full" />
              <Skeleton className="h-[1px] w-full" />
              <Skeleton className="h-[1px] w-full" />
            </div>
            {/* X-Axis (Хугацаа) орлох skeleton */}
            <div className="flex justify-between mt-4">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cyan} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={cyan} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPageViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={green} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="timeLabel"
                tick={{ fill: tickColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fill: tickColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 1000 ? `${v / 1000}k` : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="visitors"
                stroke={cyan}
                strokeWidth={2}
                fill="url(#gVisitors)"
                dot={false}
                activeDot={{ r: 4, fill: cyan, strokeWidth: 0 }}
                isAnimationActive={true}
              />
              <Area
                type="monotone"
                dataKey="pageViews"
                stroke={green}
                strokeWidth={2}
                fill="url(#gPageViews)"
                dot={false}
                activeDot={{ r: 4, fill: green, strokeWidth: 0 }}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
