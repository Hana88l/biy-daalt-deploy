import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'

export default function CountryList({ data, isLoading, title = 'Top Countries' }) {
  const normalizedData = (data || []).map((d) => ({
    country: d.country,
    visitors: d.visitors !== undefined ? d.visitors : d.count || 0,
    flag: d.flag || '',
  }))
  const max = normalizedData[0]?.visitors || 1

  return (
    <Card glow>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {normalizedData.map((d, i) => (
              <div key={d.country || i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{d.flag}</span>
                    <span className="text-xs text-text-secondary">{d.country}</span>
                  </div>
                  <span className="text-xs font-mono text-text-primary">{d.visitors.toLocaleString()}</span>
                </div>
                <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-cyan/50 transition-all duration-700"
                    style={{ width: `${(d.visitors / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
