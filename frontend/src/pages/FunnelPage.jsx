import React from 'react'
import Layout from '../components/layout/Layout'
import FunnelChart from '../components/charts/FunnelChart'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useAnalyticsContext } from '../context/AnalyticsContext'

export default function Funnel() {
  const { funnel } = useAnalyticsContext()
  
  const normalizedFunnel = (funnel || []).map(item => ({
    stage: item.stage,
    value: item.value !== undefined ? item.value : (item.count || 0),
    pct: item.pct !== undefined ? item.pct : (item.rate || 0)
  }))

  return (
    <Layout title="Funnels" subtitle="Conversion flow analysis">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChart data={funnel} />

        <Card glow>
          <CardHeader>
            <CardTitle>Stage Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {normalizedFunnel.map((stage, i) => (
                <div key={stage.stage} className="flex items-center justify-between py-2 border-b border-bg-border/50 last:border-0">
                  <div>
                    <p className="text-sm text-text-primary">{stage.stage}</p>
                    <p className="text-xs text-text-muted font-mono">{stage.pct}% of total</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-display font-700 text-text-primary">{stage.value.toLocaleString()}</p>
                    {i > 0 && (
                      <p className="text-xs text-accent-red font-mono">
                        -{(normalizedFunnel[i-1].value - stage.value).toLocaleString()} lost
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
