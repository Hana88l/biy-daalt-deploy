import { clsx } from 'clsx'

export function cn(...args) {
  return clsx(...args)
}

export function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

export const eventColorMap = {
  page_view: 'rgb(var(--color-accent-cyan) / 1)',
  click: 'rgb(var(--color-accent-green) / 1)',
  purchase: 'rgb(var(--color-accent-amber) / 1)',
  signup: 'rgb(var(--color-accent-purple) / 1)',
  error: 'rgb(var(--color-accent-red) / 1)',
  logout: 'rgb(var(--color-text-muted) / 1)',
}

export const alertColorMap = {
  warning: { bg: 'rgb(var(--color-accent-amber) / 0.08)', border: 'rgb(var(--color-accent-amber) / 0.25)', icon: 'rgb(var(--color-accent-amber) / 1)', dot: 'bg-accent-amber' },
  error: { bg: 'rgb(var(--color-accent-red) / 0.08)', border: 'rgb(var(--color-accent-red) / 0.25)', icon: 'rgb(var(--color-accent-red) / 1)', dot: 'bg-accent-red' },
  info: { bg: 'rgb(var(--color-accent-cyan) / 0.08)', border: 'rgb(var(--color-accent-cyan) / 0.25)', icon: 'rgb(var(--color-accent-cyan) / 1)', dot: 'bg-accent-cyan' },
  success: { bg: 'rgb(var(--color-accent-green) / 0.08)', border: 'rgb(var(--color-accent-green) / 0.25)', icon: 'rgb(var(--color-accent-green) / 1)', dot: 'bg-accent-green' },
}
