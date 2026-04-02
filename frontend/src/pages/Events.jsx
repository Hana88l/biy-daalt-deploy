import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { useAnalyticsContext } from '../context/AnalyticsContext'

const EVENT_TYPES = ['all', 'page_view', 'click',  'signup', 'error',]
const variantMap = {
  page_view: 'cyan', click: 'green',
  signup: 'purple', error: 'red',
}

export default function Events() {
  const { events = [], dateRange } = useAnalyticsContext() // Default утга [] өгөв
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [searchParams] = useSearchParams()
  const rangeLabelMap = {
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  }
  const rangeLabel = rangeLabelMap[dateRange] || "Last 7 days"

  useEffect(() => {
    const q = searchParams.get('q') || ''
    setSearch(q)
  }, [searchParams])

  // Хамгаалалттай шүүлтүүр
  const filtered = (events || []).filter(e => {
    // Талбарууд байхгүй бол хоосон текст авна
    const page = e?.page || ''
    const eventName = e?.event || ''
    const userId = e?.userId || ''
    const searchTerm = search.toLowerCase()

    const matchSearch = 
      page.toLowerCase().includes(searchTerm) || 
      eventName.toLowerCase().includes(searchTerm) || 
      userId.toLowerCase().includes(searchTerm)

    const matchFilter = filter === 'all' || e?.event === filter
    return matchSearch && matchFilter
  })

  return (
    <Layout title="Events" subtitle={`${rangeLabel} · All tracked events`}>
      {/* Summary counts */}
      <div className="flex gap-2 flex-wrap mb-4">
        {EVENT_TYPES.map(type => {
          // events байхгүй бол 0 гэж харуулна
          const count = type === 'all' 
            ? (events?.length || 0) 
            : (events?.filter(e => e?.event === type).length || 0)
          
          return (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                filter === type
                  ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                  : 'bg-bg-card text-text-secondary border-bg-border hover:border-bg-border hover:text-text-primary'
              }`}
            >
              {type} <span className="ml-1 opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search events, pages, users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs bg-bg-elevated border border-bg-border rounded-lg text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40 w-52"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bg-border">
                  {['Event', 'Page', 'User', 'Country', 'Time'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-text-muted font-mono font-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={i} className="border-b border-bg-border/40 hover:bg-bg-elevated/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <Badge variant={variantMap[e?.event] || 'muted'}>{e?.event || 'unknown'}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-text-secondary">{e?.page || '/'}</td>
                    <td className="px-4 py-2.5 font-mono text-text-muted">{e?.userId || 'anonymous'}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{e?.country || 'N/A'}</td>
                    <td className="px-4 py-2.5 font-mono text-text-muted">{e?.time || 'now'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-xs">
                      No events match your filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Layout>
  )
}
