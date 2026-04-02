import React from 'react'
import { TrendingUp, TrendingDown, Users, DollarSign, AlertCircle } from 'lucide-react'
import { LineChart, Line } from 'recharts'
import { Skeleton } from '../ui/Skeleton'
import { cn } from '../../utils/helpers'

const iconMap = {
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle,
}

const colorConfig = {
  cyan: {
    text: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/20',
    hoverBorder: 'hover:border-accent-cyan/30',
    stroke: 'rgb(var(--color-accent-cyan) / 1)',
  },
  green: {
    text: 'text-accent-green',
    bg: 'bg-accent-green/10',
    border: 'border-accent-green/20',
    hoverBorder: 'hover:border-accent-green/30',
    stroke: 'rgb(var(--color-accent-green) / 1)',
  },
  amber: {
    text: 'text-accent-amber',
    bg: 'bg-accent-amber/10',
    border: 'border-accent-amber/20',
    hoverBorder: 'hover:border-accent-amber/30',
    stroke: 'rgb(var(--color-accent-amber) / 1)',
  },
  red: {
    text: 'text-accent-red',
    bg: 'bg-accent-red/10',
    border: 'border-accent-red/20',
    hoverBorder: 'hover:border-accent-red/30',
    stroke: 'rgb(var(--color-accent-red) / 1)',
  },
}

export default function KPICard({
  label,
  value,
  change,
  trend,
  color,
  icon,
  sparkline,
  isLoading,
}) {
  const IconComp = iconMap[icon] || TrendingUp
  const cfg = colorConfig[color] || colorConfig.cyan

  const changeText = typeof change === 'string' ? change.trim() : ''
  const hasChange = changeText.length > 0
  const isNegativeChange = hasChange ? changeText.startsWith('-') : false
  const direction = hasChange ? (isNegativeChange ? 'down' : 'up') : (trend === 'down' ? 'down' : 'up')
  const isUp = direction === 'up'
  const isGood = color === 'red' ? !isUp : isUp
  const sparkData = sparkline?.map((v) => ({ v })) || []

  if (isLoading) {
    return (
      <div className="rounded-xl bg-bg-card border border-bg-border p-4">
        <div className="flex items-start justify-between mb-3">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-14 h-5 rounded-md" />
        </div>
        <div className="mb-3 space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        {sparkline && <Skeleton className="h-10 w-full" />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-bg-card border border-bg-border p-4 slide-in transition-all duration-200 group',
        cfg.hoverBorder,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2 rounded-lg border transition-colors', cfg.bg, cfg.border)}>
          <IconComp size={14} className={cfg.text} />
        </div>

        {hasChange && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md border transition-opacity',
              isGood
                ? 'text-accent-green bg-accent-green/10 border-accent-green/20'
                : 'text-accent-red bg-accent-red/10 border-accent-red/20',
            )}
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {change}
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="font-display text-2xl font-700 text-text-primary tracking-tight">{value || '0'}</div>
        <div className="text-xs text-text-secondary mt-0.5 font-medium">{label}</div>
      </div>

      {sparkData.length > 0 && (
        <div className="h-10 -mx-1 flex items-end overflow-hidden">
          <LineChart width={160} height={40} data={sparkData}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={cfg.stroke}
              strokeWidth={2}
              dot={false}
              strokeOpacity={0.8}
              isAnimationActive
            />
          </LineChart>
        </div>
      )}
    </div>
  )
}
