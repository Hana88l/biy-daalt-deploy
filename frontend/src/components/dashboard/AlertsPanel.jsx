import React from 'react'
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { alertColorMap } from '../../utils/helpers'

const iconMap = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: XCircle,
}

export default function AlertsPanel({ alerts, onDismiss, isLoading }) {
  if (isLoading) {
    return (
      <Card glow>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border border-bg-border">
                <Skeleton className="w-4 h-4 rounded-full shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!alerts.length) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <CheckCircle size={24} className="text-accent-green mx-auto mb-2" />
          <p className="text-xs text-text-secondary">All clear - no active alerts</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card glow>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <span className="text-xs font-mono text-text-muted">{alerts.filter((alert) => !alert.ack).length} active</span>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => {
            const cfg = alertColorMap[alert.type] || alertColorMap.info
            const Icon = iconMap[alert.type] || Info

            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg border transition-all"
                style={{
                  background: cfg.bg,
                  borderColor: alert.ack ? 'rgb(var(--color-bg-border) / 1)' : cfg.border,
                  opacity: alert.ack ? 0.5 : 1,
                }}
              >
                <Icon size={14} style={{ color: cfg.icon }} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary leading-snug">{alert.message}</p>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">{alert.time || 'Updated just now'}</p>
                </div>
                {!alert.ack && (
                  <button
                    onClick={() => onDismiss(alert.id)}
                    className="text-text-muted hover:text-text-secondary transition-colors shrink-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
