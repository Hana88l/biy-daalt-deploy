import React, { createContext, useContext } from 'react'
import { useAnalytics, useRealtime } from '../hooks/useAnalytics'

const AnalyticsContext = createContext(null)

export function AnalyticsProvider({ children }) {
  const analytics = useAnalytics()
  const realtime = useRealtime(
    analytics?.kpis?.totalEvents || 0,
    analytics?.kpis?.authErrors5m || 0,
    analytics?.kpis?.authAttempts5m || 0,
    analytics?.kpis?.connectedSite || false,
    analytics?.kpis?.liveTrackingDetected || false
  )

  return (
    <AnalyticsContext.Provider value={{ ...analytics, ...realtime }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

export function useAnalyticsContext() {
  const ctx = useContext(AnalyticsContext)
  if (!ctx) throw new Error('useAnalyticsContext must be inside AnalyticsProvider')
  return ctx
}
