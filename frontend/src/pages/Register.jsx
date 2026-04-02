import React, { useEffect, useMemo, useState } from 'react'
import { Activity, Lock, Mail, Moon, Sun } from 'lucide-react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import GoogleAuthButton from '../components/auth/GoogleAuthButton'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function Register() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, loginWithGoogle, register } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const redirectTo = useMemo(() => {
    const from = location.state?.from?.pathname
    return typeof from === 'string' && from.length > 0 ? from : '/'
  }, [location.state])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true })
  }, [isAuthenticated, navigate, redirectTo])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      return
    }

    setSubmitting(true)
    try {
      await register(trimmedEmail, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to register account')
    } finally {
      setSubmitting(false)
    }
  }

  const onGoogleSubmit = async (credential) => {
    setError('')
    setSubmitting(true)

    try {
      await loginWithGoogle(credential)
      navigate(redirectTo, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base grid-bg flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-bg-border bg-bg-card/50 backdrop-blur-sm text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto w-11 h-11 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
            <Activity size={18} className="text-accent-cyan" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-700 text-text-primary tracking-tight">
            Quantum <span className="text-gradient-cyan">Stars</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">Create your analytics account</p>
        </div>

        <div className="rounded-2xl bg-bg-card border border-bg-border p-5 card-glow">
          <GoogleAuthButton
            disabled={submitting}
            onCredential={onGoogleSubmit}
            onError={setError}
          />
          <p className="mb-4 text-center text-[11px] text-text-muted">
            Continue with Google to create your account and use AI right away.
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-text-muted block mb-1">EMAIL</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-bg-elevated border border-bg-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-text-muted block mb-1">PASSWORD</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-bg-elevated border border-bg-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-accent-red/20 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-sm font-500 hover:bg-accent-cyan/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Registering…' : 'Sign Up'}
            </button>

            <div className="text-[11px] text-text-muted text-center pt-2 border-t border-bg-border/60">
              Already have an account?{' '}
              <Link to="/login" className="text-accent-cyan font-medium hover:underline">
                Sign in here
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
