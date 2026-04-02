import React from 'react'
import { cn } from '../../utils/helpers'

export function Card({ children, className, glow = false, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-bg-card border border-bg-border transition-all duration-200',
        glow && 'hover:border-accent-cyan/20 hover:shadow-glow',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return (
    <div className={cn('flex items-center justify-between px-4 pt-4 pb-2', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={cn('text-xs font-500 text-text-secondary uppercase tracking-widest font-mono', className)}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className }) {
  return (
    <div className={cn('px-4 pb-4', className)}>
      {children}
    </div>
  )
}
