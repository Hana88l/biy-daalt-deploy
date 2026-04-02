import React from 'react'
import { ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'

export default function TopPages({
  data,
  isLoading,
  title = 'Top Pages',
  subtitle = 'by views',
  viewsLabel = 'Views',
  statusLabel = 'Bounce',
  loadLabel = 'Avg Time',
  statusMode = 'percent',
  siteUrl = null,
}) {
  const openPage = (href) => {
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const resolveHref = (value, baseUrl = null) => {
    if (!value) return null

    try {
      const nextUrl = baseUrl ? new URL(String(value), baseUrl) : new URL(String(value))
      if (!['http:', 'https:'].includes(nextUrl.protocol)) return null
      return nextUrl.toString()
    } catch {
      return null
    }
  }

  const resolvePageHref = (row) => resolveHref(row.href || row.fullUrl, siteUrl) || resolveHref(row.page, siteUrl)

  return (
    <Card glow className="col-span-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {isLoading ? <Skeleton className="h-4 w-14" /> : <span className="text-xs text-text-muted font-mono">{subtitle}</span>}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left px-4 py-2 text-text-muted font-mono font-400">Page</th>
              <th className="text-right px-4 py-2 text-text-muted font-mono font-400">{viewsLabel}</th>
              <th className="text-right px-4 py-2 text-text-muted font-mono font-400">{statusLabel}</th>
              <th className="text-right px-4 py-2 text-text-muted font-mono font-400">{loadLabel}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-bg-border/50">
                    <td className="px-4 py-2.5"><Skeleton className="h-3 w-28" /></td>
                    <td className="px-4 py-2.5 text-right"><div className="flex justify-end"><Skeleton className="h-3 w-10" /></div></td>
                    <td className="px-4 py-2.5 text-right"><div className="flex justify-end"><Skeleton className="h-3 w-12" /></div></td>
                    <td className="px-4 py-2.5 text-right"><div className="flex justify-end"><Skeleton className="h-3 w-14" /></div></td>
                  </tr>
                ))
              : data.map((row, i) => {
                  const href = resolvePageHref(row)
                  const statusValue = row.status || row.bounce || row.health || 'n/a'
                  const avgValue = row.avgTime || row.avg || row.load || 'n/a'
                  const normalizedStatus = String(statusValue).toLowerCase()
                  const numericStatus = Number.parseFloat(statusValue)
                  const hasHealthIssue =
                    normalizedStatus.includes('issue') ||
                    normalizedStatus.includes('critical') ||
                    normalizedStatus.includes('attention') ||
                    Number(row.statusCode || 0) >= 400
                  const statusClass =
                    statusValue === 'n/a'
                      ? 'text-text-muted'
                      : statusMode === 'health'
                        ? hasHealthIssue
                          ? 'text-accent-red'
                          : 'text-accent-green'
                        : Number.isFinite(numericStatus)
                          ? numericStatus > 50
                            ? 'text-accent-red'
                            : 'text-accent-green'
                          : 'text-text-secondary'

                  return (
                    <tr
                      key={row.page}
                      className={`border-b border-bg-border/50 transition-colors group hover:bg-bg-elevated/50 ${
                        href ? 'cursor-pointer' : ''
                      }`}
                      onClick={href ? () => openPage(href) : undefined}
                      onKeyDown={href ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openPage(href)
                        }
                      } : undefined}
                      tabIndex={href ? 0 : undefined}
                      role={href ? 'link' : undefined}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-text-muted font-mono w-4">{i + 1}</span>
                          <span className="text-text-secondary font-mono group-hover:text-accent-cyan transition-colors">
                            {row.page}
                          </span>
                          {href && (
                            <ExternalLink size={10} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-text-primary font-mono">{row.views.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono ${statusClass}`}>
                          {statusValue}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono ${avgValue === 'n/a' ? 'text-text-muted' : 'text-text-secondary'}`}>{avgValue}</span>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
