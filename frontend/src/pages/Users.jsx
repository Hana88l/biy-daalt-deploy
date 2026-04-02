import React, { useEffect, useMemo, useState } from 'react'
import Layout from '../components/layout/Layout'
import CountryList from '../components/dashboard/CountryList'
import DeviceChart from '../components/charts/DeviceChart'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useAnalyticsContext } from '../context/AnalyticsContext'
import { useAuth } from '../context/AuthContext'
import { fetchWithAuth } from '../utils/api'

export default function Users() {
  const { countryData, deviceData, events } = useAnalyticsContext()
  const { user } = useAuth()
  const [adminUsers, setAdminUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showApiKeys, setShowApiKeys] = useState(false)
  const isAdmin = user?.email === 'admin@quantum.com'

  const uniqueUsers = useMemo(() => (
    [...new Set(events.map(e => e.userId))].slice(0, 8)
  ), [events])

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true
    let intervalId
    const loadUsers = async () => {
      setLoadingUsers(true)
      try {
        const data = await fetchWithAuth('/analytics/users')
        if (mounted && Array.isArray(data)) setAdminUsers(data)
      } catch (err) {
        // ignore for now; admin view will just show last successful fetch
      } finally {
        if (mounted) setLoadingUsers(false)
      }
    }
    loadUsers()
    intervalId = setInterval(loadUsers, 10000)
    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [isAdmin])

  return (
    <Layout
      title={isAdmin ? "Users" : "Users"}
      subtitle={isAdmin ? "All accounts across the platform" : "User profiles and segmentation"}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <CountryList data={countryData} />
        <DeviceChart data={deviceData} />

        <Card glow>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{isAdmin ? "Latest Signups" : "Recent Users"}</CardTitle>
              {isAdmin && (
                <button
                  onClick={() => setShowApiKeys(prev => !prev)}
                  className="px-2 py-1 rounded-md text-[10px] font-mono border border-bg-border text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-colors"
                >
                  {showApiKeys ? "Hide API Keys" : "Show API Keys"}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <div className="space-y-2">
                {loadingUsers && adminUsers.length === 0 && (
                  <p className="text-xs text-text-muted">Loading users...</p>
                )}
                {!loadingUsers && adminUsers.length === 0 && (
                  <p className="text-xs text-text-muted">No users found yet.</p>
                )}
                {adminUsers.slice(0, 8).map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-1">
                    <div className="w-7 h-7 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center text-[10px] font-mono text-accent-cyan shrink-0">
                      {String(u.id).slice(-2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary font-mono truncate">{u.email}</p>
                      <p className="text-[10px] text-text-muted">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                      {showApiKeys && (
                        <p className="text-[10px] text-text-muted font-mono truncate">{u.apiKey}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted">{u._count?.events || 0} events</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {uniqueUsers.map((userId) => (
                  <div key={userId} className="flex items-center gap-3 py-1">
                    <div className="w-7 h-7 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center text-[10px] font-mono text-accent-cyan shrink-0">
                      {userId.slice(-2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary font-mono truncate">{userId}</p>
                      <p className="text-[10px] text-text-muted">Active just now</p>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
