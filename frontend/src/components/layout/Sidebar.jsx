import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Users, Settings, Bell, FileText, BarChart3,
  Zap, ChevronLeft, ChevronRight, Bot,
} from 'lucide-react'
import { cn } from '../../utils/helpers'
import { useAnalyticsContext } from '../../context/AnalyticsContext'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/events', icon: Zap, label: 'Events' },
  { to: '/realtime', icon: FileText, label: 'Logs' },
  { to: '/funnel', icon: BarChart3, label: 'Metrics' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/ai', icon: Bot, label: 'AI Workspace' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { liveCount } = useAnalyticsContext()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-screen bg-bg-card border-r border-bg-border transition-all duration-300 shrink-0',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-bg-border', collapsed && 'justify-center px-2')}>
        <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center shrink-0">
          <Activity size={16} className="text-accent-cyan" />
        </div>
        {!collapsed && (
          <span className="font-display font-700 text-text-primary tracking-tight">
            Quantum <span className="text-gradient-cyan">Stars</span>
          </span>
        )}
      </div>

      {/* Live indicator */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-accent-green/5 border border-accent-green/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-green pulse-dot shrink-0" />
          <span className="text-xs text-text-secondary font-mono">
            <span className="text-accent-green font-500">{liveCount.toLocaleString()}</span> live
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 relative group',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              )
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span className="font-body font-400">{label}</span>}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 rounded bg-bg-elevated border border-bg-border text-xs text-text-primary whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-bg-elevated border border-bg-border flex items-center justify-center text-text-secondary hover:text-accent-cyan transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
