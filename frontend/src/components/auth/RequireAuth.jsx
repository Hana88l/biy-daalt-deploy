import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function RequireAuth() {
  const { isAuthenticated, isLoadingAuth } = useAuth()
  const location = useLocation()

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-bg-base grid-bg flex items-center justify-center p-6">
        <div className="rounded-2xl border border-bg-border bg-bg-card px-6 py-5 text-center card-glow">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-text-muted">Session Check</p>
          <p className="mt-2 text-sm text-text-primary">Checking your access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
