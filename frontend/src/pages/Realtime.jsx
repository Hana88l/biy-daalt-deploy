import React, { useEffect, useState } from 'react'
import { Activity, Zap, Clock, AlertCircle } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import EventStream from '../components/dashboard/EventStream'
import { useAnalyticsContext } from '../context/AnalyticsContext'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

export default function Realtime() {
  const { events, liveCount, eventsPerSec, totalEvents, authAttempts5m, authErrors5m, kpis } = useAnalyticsContext()
  const [sparkData, setSparkData] = useState(Array.from({ length: 30 }, (_, i) => ({ t: i, v: 0 })))
  const connectedSite = Boolean(kpis?.connectedSite)
  const liveTrackingDetected = Boolean(kpis?.liveTrackingDetected)
  const siteMode = connectedSite && !liveTrackingDetected
  const authSummary =
    authAttempts5m > 0
      ? `${authAttempts5m || 0} auth attempts in 5m`
      : authErrors5m > 0
        ? 'auth errors in last 5m'
        : 'last 5 minutes'

  useEffect(() => {
    setSparkData((prev) => [...prev.slice(1), { t: prev[prev.length - 1].t + 1, v: eventsPerSec }])
  }, [eventsPerSec])

  const stats = [
    { label: siteMode ? 'Active Signals' : 'Live Users', value: liveCount.toLocaleString(), icon: Activity, color: 'green', sub: siteMode ? 'recent scan activity' : 'right now' },
    { label: siteMode ? 'Signals / sec' : 'Events / sec', value: eventsPerSec, icon: Zap, color: 'cyan', sub: siteMode ? 'monitoring burst rate' : 'ingestion rate' },
    { label: siteMode ? 'Total Signals' : 'Total Events', value: totalEvents.toLocaleString(), icon: Clock, color: 'amber', sub: siteMode ? 'latest monitoring cycle' : 'all time' },
    {
      label: siteMode ? 'Site Issues' : 'Auth Errors',
      value: (authErrors5m || 0).toLocaleString(),
      icon: AlertCircle,
      color: 'red',
      sub: siteMode ? 'latest detected issues' : authSummary,
    },
  ]

  const colorMap = {
    green: 'text-accent-green border-accent-green/20 bg-accent-green/10',
    cyan: 'text-accent-cyan border-accent-cyan/20 bg-accent-cyan/10',
    amber: 'text-accent-amber border-accent-amber/20 bg-accent-amber/10',
    red: 'text-accent-red border-accent-red/20 bg-accent-red/10',
  }

  const tickColor = 'rgb(var(--color-text-muted) / 1)'
  const cyan = 'rgb(var(--color-accent-cyan) / 1)'
  const subtitle = siteMode
    ? 'URL monitoring mode - refreshes after each scan cycle'
    : connectedSite && liveTrackingDetected
      ? 'Live tracking for the connected site - updates in near real time'
      : 'Live monitoring - updates every second'

  return (
    <Layout title="Real-time" subtitle={subtitle}>
      {siteMode && (
        <div className="mb-4 rounded-xl border border-accent-cyan/20 bg-accent-cyan/8 px-4 py-3">
          <p className="text-xs text-text-primary">URL-only monitoring cannot detect manual visits like `/upload`.</p>
          <p className="text-[11px] text-text-secondary mt-1">Enable live tracking to stream real visitor endpoints into this page and Top Pages.</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} glow>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg border ${colorMap[stat.color]}`}>
                    <Icon size={13} />
                  </div>
                  <span className="text-xs text-text-muted font-mono">{stat.sub}</span>
                </div>
                <div className="font-display text-2xl font-700 text-text-primary">{stat.value}</div>
                <div className="text-xs text-text-secondary mt-0.5">{stat.label}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card glow className="col-span-2">
          <CardHeader>
            <CardTitle>{siteMode ? 'Monitoring Signals Per Second' : 'Events Per Second'}</CardTitle>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />
              <span className="text-[10px] text-accent-green font-mono">LIVE</span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gLive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cyan} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgb(var(--color-bg-elevated) / 1)',
                    border: '1px solid rgb(var(--color-bg-border) / 1)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: tickColor }}
                  itemStyle={{ color: cyan }}
                  formatter={(value) => [`${value} ${siteMode ? 'sps' : 'eps'}`, 'rate']}
                  labelFormatter={() => ''}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={cyan}
                  strokeWidth={2}
                  fill="url(#gLive)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <EventStream events={events} title={siteMode ? 'Monitoring Events' : 'Live Events'} liveLabel={siteMode ? 'AUTO' : 'LIVE'} />
      </div>
    </Layout>
  )
}
