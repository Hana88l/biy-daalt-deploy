import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'

const CustomTooltip = ({ active, payload, label, valueSuffix = 'events' }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-text-secondary font-mono mb-1">{label}</p>
      <p className="text-accent-cyan font-mono">{payload[0]?.value?.toLocaleString()} {valueSuffix}</p>
      {payload[1] && <p className="text-accent-red font-mono">{payload[1]?.value} errors</p>}
    </div>
  )
}

export default function HourlyChart({
  data,
  isLoading,
  title = 'Hourly Event Volume',
  primaryLabel = 'Events',
  secondaryLabel = 'Errors',
  valueSuffix = 'events',
}) {
  const tickFormatter = (val, i) => (i % 3 === 0 ? val : '')
  const gridColor = 'rgb(var(--color-bg-border) / 0.55)'
  const tickColor = 'rgb(var(--color-text-muted) / 1)'
  const cyan = 'rgb(var(--color-accent-cyan) / 1)'
  const red = 'rgb(var(--color-accent-red) / 1)'

  return (
    <Card glow className="col-span-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {isLoading ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <div className="flex gap-4 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded bg-accent-cyan/60" />{primaryLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded bg-accent-red/60" />{secondaryLabel}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="w-full h-[180px] flex items-end gap-2">
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className="flex-1 flex items-end">
                <Skeleton className="w-full rounded-t h-full" />
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: tickColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={tickFormatter}
              />
              <YAxis
                tick={{ fill: tickColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip valueSuffix={valueSuffix} />} cursor={{ fill: 'rgb(var(--color-bg-border) / 0.2)' }} />
              <Bar dataKey="events" fill={cyan} fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={16} />
              <Bar dataKey="errors" fill={red} fillOpacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
