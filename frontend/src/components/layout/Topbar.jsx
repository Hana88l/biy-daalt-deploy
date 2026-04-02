import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, Sun, Moon, LogOut } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { useAnalyticsContext } from '../../context/AnalyticsContext'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

const ranges = ['24h', '7d']

export default function Topbar({ title, subtitle }) {
  const { dateRange, changeDateRange, refreshData, loading } = useAnalyticsContext()
  const { theme, toggleTheme } = useTheme()
  const { logout } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const navigate = useNavigate()

  const submitSearch = () => {
    const trimmed = searchTerm.trim()
    if (!trimmed) {
      navigate('/events')
      return
    }
    const params = new URLSearchParams({ q: trimmed })
    navigate(`/events?${params.toString()}`)
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-bg-border bg-bg-card/50 backdrop-blur-sm shrink-0">
      <div>
        <h1 className="font-display text-base font-600 text-text-primary">{title}</h1>
        {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitSearch()
            }}
            className="pl-7 pr-3 py-1.5 text-xs bg-bg-elevated border border-bg-border rounded-lg text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40 w-40 transition-all focus:w-52"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-0.5 p-0.5 bg-bg-elevated rounded-lg border border-bg-border">
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => changeDateRange(r)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md font-mono transition-all',
                dateRange === r
                  ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={refreshData}
          className="p-1.5 rounded-lg border border-bg-border bg-bg-elevated text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
        >
          <RefreshCw size={13} className={cn('transition-transform', loading && 'animate-spin')} />
        </button>

        {/* Theme */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg border border-bg-border bg-bg-elevated text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="p-1.5 rounded-lg border border-bg-border bg-bg-elevated text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={13} />
        </button>

      </div>
    </header>
  )
}
