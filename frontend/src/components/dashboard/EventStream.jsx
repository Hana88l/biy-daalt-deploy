import React from 'react'
import { Zap } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import Badge from '../ui/Badge'
import { eventColorMap } from '../../utils/helpers'

const variantMap = {
  page_view: 'cyan',
  click: 'green',
  purchase: 'amber',
  signup: 'purple',
  error: 'red',
  logout: 'muted',
}

export default function EventStream({ events, isLoading, title = 'Live Events', liveLabel = 'LIVE' }) {
  return (
    <Card glow>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {isLoading ? (
          <Skeleton className="h-4 w-10" />
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />
            <span className="text-[10px] text-accent-green font-mono">{liveLabel}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {isLoading
            ? Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-1.5">
                  <Skeleton className="w-3 h-3 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))
            : events.slice(0, 12).map((e, i) => (
                <div
                  key={`${e.id}-${i}`}
                  className="flex items-center gap-2 px-4 py-1.5 hover:bg-bg-elevated/50 transition-colors"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <Zap
                    size={10}
                    style={{ color: eventColorMap[e.event] || 'rgb(var(--color-text-muted) / 1)' }}
                    className="shrink-0"
                  />
                  <Badge variant={variantMap[e.event] || 'muted'}>
                    {e.event}
                  </Badge>
                  <span className="text-[11px] text-text-secondary font-mono truncate flex-1">
                    {e.page}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono shrink-0">{e.country}</span>
                  <span className="text-[10px] text-text-muted font-mono shrink-0 w-12 text-right">{e.time}</span>
                </div>
              ))}
        </div>
      </CardContent>
    </Card>
  )
}
