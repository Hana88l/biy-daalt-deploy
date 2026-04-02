import React from 'react'
import { cn } from '../../utils/helpers'

const variants = {
  cyan: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  green: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  amber: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
  red: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  muted: 'bg-bg-elevated text-text-secondary border-bg-border',
}

export default function Badge({ children, variant = 'muted', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
