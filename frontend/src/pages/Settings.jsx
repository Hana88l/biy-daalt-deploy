import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy,
  Check,
  Key,
  Globe,
  Bell,
  Shield,
  Loader2,
  ScanSearch,
  Link2,
  Trash2,
  Power,
  Play,
  RefreshCw,
  Bot,
  Eye,
  EyeOff,
  MessageSquare,
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useAuth } from '../context/AuthContext'
import { useAnalyticsContext } from '../context/AnalyticsContext'
import { fetchWithAuth } from '../utils/api'

const DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_AI_MODEL = 'qwen/qwen-2.5-72b-instruct:free'
const DEFAULT_AI_SYSTEM_PROMPT = 'You are Quantum Stars AI, an analytics copilot for a SaaS dashboard. Default to Mongolian unless the user clearly asks for another language. Use only the provided analytics context and conversation history. Be practical, concise, and specific about patterns, risks, and recommended actions. If the context does not contain enough evidence, say that clearly instead of guessing.'

function normalizeInputUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function formatDateTime(value) {
  if (!value) return 'Not analyzed yet'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not analyzed yet'

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSiteBadge(site) {
  if (site?.isActive) {
    return {
      label: 'Active',
      className: 'text-accent-green border-accent-green/25 bg-accent-green/10',
    }
  }

  if (site?.isEnabled) {
    return {
      label: 'Ready',
      className: 'text-accent-cyan border-accent-cyan/25 bg-accent-cyan/10',
    }
  }

  return {
    label: 'Deactivated',
    className: 'text-text-muted border-bg-border bg-bg-elevated',
  }
}

function buildSnapshot(response) {
  return {
    loaded: true,
    site: response?.site || null,
    activeSite: response?.activeSite || response?.site || null,
    summary: response?.summary || null,
    pages: response?.pages || [],
    sites: Array.isArray(response?.sites) ? response.sites : [],
  }
}

function buildAiForm(settings) {
  return {
    enabled: Boolean(settings?.enabled),
    provider: settings?.provider || 'openai-compatible',
    baseUrl: settings?.baseUrl || DEFAULT_AI_BASE_URL,
    model: settings?.model || DEFAULT_AI_MODEL,
    apiKey: '',
    systemPrompt: settings?.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
  }
}

function getAiSourceLabel(source) {
  switch (source) {
    case 'env_shared':
      return 'Server shared provider'
    case 'admin_shared':
      return 'Workspace shared provider'
    case 'user':
      return 'Personal provider'
    case 'local_builtin':
      return 'Built-in analytics copilot'
    default:
      return 'Unavailable'
  }
}

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const { refreshData } = useAnalyticsContext()
  const [copied, setCopied] = useState(false)
  const [siteUrl, setSiteUrl] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [pendingSiteAction, setPendingSiteAction] = useState({ id: null, type: '' })
  const [siteSnapshot, setSiteSnapshot] = useState({ loaded: false, site: null, activeSite: null, summary: null, pages: [], sites: null })
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const [aiForm, setAiForm] = useState(buildAiForm(user?.aiSettings))
  const [aiStatus, setAiStatus] = useState({ type: 'idle', message: '' })
  const [isSavingAi, setIsSavingAi] = useState(false)
  const [isClearingAiKey, setIsClearingAiKey] = useState(false)
  const [showAiApiKey, setShowAiApiKey] = useState(false)
  const [settings, setSettings] = useState({
    rateLimit: true,
    emailAlerts: true,
    slackAlerts: false,
    anonymizeIP: true,
    retentionDays: '90',
  })

  const hasSnapshot = siteSnapshot?.loaded === true
  const sites = Array.isArray(siteSnapshot?.sites) ? siteSnapshot.sites : (user?.sites || [])
  const activeSite = hasSnapshot ? (siteSnapshot?.activeSite || siteSnapshot?.site || null) : (user?.activeSite || null)
  const displayKey = user?.apiKey || ''
  const summary = hasSnapshot ? siteSnapshot?.summary : null
  const topPages = hasSnapshot ? (siteSnapshot?.pages || []) : []
  const aiSettings = user?.aiSettings || null
  const [aiRuntime, setAiRuntime] = useState({
    loading: true,
    available: false,
    source: 'none',
    shared: false,
    provider: null,
    model: null,
  })
  const serverManagedAi = aiRuntime.source === 'env_shared'

  const loadActiveSiteSnapshot = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/analytics/site')
      setSiteSnapshot(buildSnapshot(response))
    } catch {
      setSiteSnapshot({ loaded: false, site: null, activeSite: null, summary: null, pages: [], sites: null })
    }
  }, [])

  const loadAiRuntime = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/ai/settings')
      setAiRuntime({
        loading: false,
        available: Boolean(response?.runtime?.available),
        source: response?.runtime?.source || 'none',
        shared: Boolean(response?.runtime?.shared),
        provider: response?.runtime?.provider || null,
        model: response?.runtime?.model || null,
      })
    } catch {
      setAiRuntime({
        loading: false,
        available: false,
        source: 'none',
        shared: false,
        provider: null,
        model: null,
      })
    }
  }, [])

  useEffect(() => {
    loadActiveSiteSnapshot()
  }, [loadActiveSiteSnapshot, user?.activeSiteId])

  useEffect(() => {
    loadAiRuntime()
  }, [loadAiRuntime, user?.id, user?.aiSettings?.enabled, user?.aiSettings?.model, user?.aiSettings?.hasApiKey])

  useEffect(() => {
    setAiForm(buildAiForm(user?.aiSettings))
  }, [
    user?.aiSettings?.enabled,
    user?.aiSettings?.provider,
    user?.aiSettings?.baseUrl,
    user?.aiSettings?.model,
    user?.aiSettings?.systemPrompt,
  ])

  const refreshSiteState = useCallback(async () => {
    await Promise.allSettled([
      refreshUser?.(),
      refreshData?.(),
    ])
    await loadActiveSiteSnapshot()
    await loadAiRuntime()
  }, [loadActiveSiteSnapshot, loadAiRuntime, refreshData, refreshUser])

  const copyKey = () => {
    if (!displayKey) return
    navigator.clipboard.writeText(displayKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const connectSite = async () => {
    const normalizedUrl = normalizeInputUrl(siteUrl)

    if (!normalizedUrl) {
      setStatus({ type: 'error', message: 'Please enter a website URL first.' })
      return
    }

    setIsConnecting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      await fetchWithAuth('/analytics/site/connect', {
        method: 'POST',
        body: JSON.stringify({ siteUrl: normalizedUrl }),
      })

      await refreshSiteState()
      setSiteUrl('')
      setStatus({
        type: 'success',
        message: 'Site connected, analyzed, and set as the active dashboard domain.',
      })
    } catch (err) {
      setStatus({
        type: 'error',
        message: err?.message || 'Failed to connect and analyze this site.',
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const runSiteAction = async (site, action) => {
    if (!site?.id) return

    if (action === 'delete') {
      const confirmed = window.confirm(`Delete ${site.url} from your account?`)
      if (!confirmed) return
    }

    setPendingSiteAction({ id: site.id, type: action })
    setStatus({ type: 'idle', message: '' })

    try {
      let endpoint = ''
      let method = 'POST'
      let successMessage = ''

      switch (action) {
        case 'activate':
          endpoint = `/analytics/sites/${site.id}/activate`
          successMessage = `${site.url} is now the active site.`
          break
        case 'deactivate':
          endpoint = `/analytics/sites/${site.id}/deactivate`
          successMessage = `${site.url} has been deactivated.`
          break
        case 'analyze':
          endpoint = `/analytics/sites/${site.id}/analyze`
          successMessage = `${site.url} has been analyzed again.`
          break
        case 'delete':
          endpoint = `/analytics/sites/${site.id}`
          method = 'DELETE'
          successMessage = `${site.url} has been deleted.`
          break
        default:
          return
      }

      const response = await fetchWithAuth(endpoint, { method })
      await refreshSiteState()
      setSiteSnapshot(buildSnapshot(response))
      setStatus({ type: 'success', message: successMessage })
    } catch (err) {
      setStatus({
        type: 'error',
        message: err?.message || `Failed to ${action} this site.`,
      })
    } finally {
      setPendingSiteAction({ id: null, type: '' })
    }
  }

  const toggle = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }))

  const saveAiSettings = async () => {
    setIsSavingAi(true)
    setAiStatus({ type: 'idle', message: '' })

    try {
      const payload = {
        enabled: aiForm.enabled,
        provider: aiForm.provider,
        baseUrl: aiForm.baseUrl,
        model: aiForm.model,
        systemPrompt: aiForm.systemPrompt,
      }

      if (aiForm.apiKey.trim()) {
        payload.apiKey = aiForm.apiKey.trim()
      }

      await fetchWithAuth('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      await refreshUser?.()
      await loadAiRuntime()
      setAiForm((prev) => ({ ...prev, apiKey: '' }))
      setAiStatus({
        type: 'success',
        message: aiForm.enabled
          ? 'AI assistant is ready. You can start chatting from the AI workspace.'
          : 'AI settings were saved. Enable the assistant whenever you are ready.',
      })
    } catch (err) {
      setAiStatus({
        type: 'error',
        message: err?.message || 'Failed to save AI settings.',
      })
    } finally {
      setIsSavingAi(false)
    }
  }

  const clearSavedAiKey = async () => {
    const confirmed = window.confirm('Remove the saved AI API key and disable the assistant?')
    if (!confirmed) return

    setIsClearingAiKey(true)
    setAiStatus({ type: 'idle', message: '' })

    try {
      await fetchWithAuth('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: false,
          provider: aiForm.provider,
          baseUrl: aiForm.baseUrl,
          model: aiForm.model,
          systemPrompt: aiForm.systemPrompt,
          apiKey: '',
        }),
      })

      await refreshUser?.()
      await loadAiRuntime()
      setAiForm((prev) => ({ ...prev, enabled: false, apiKey: '' }))
      setAiStatus({
        type: 'success',
        message: 'Saved AI key removed successfully.',
      })
    } catch (err) {
      setAiStatus({
        type: 'error',
        message: err?.message || 'Failed to remove the saved AI key.',
      })
    } finally {
      setIsClearingAiKey(false)
    }
  }

  const activeSiteLabel = useMemo(() => {
    if (!activeSite) return 'No active site selected'
    return activeSite.name || activeSite.url
  }, [activeSite])

  return (
    <Layout title="Settings" subtitle="Manage multiple sites, switch the active domain, and control monitoring per URL">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl">
        <Card glow className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Website Connection</CardTitle>
            <ScanSearch size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-text-secondary mb-3">
              Add as many site URLs as you need. The site you activate becomes the dashboard view, while deactivated domains stop participating in monitoring.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
              <input
                type="url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://your-site.com"
                className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
              />
              <button
                onClick={connectSite}
                disabled={isConnecting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan text-xs font-600 hover:bg-accent-cyan/20 transition-all disabled:opacity-60 disabled:cursor-default"
              >
                {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                {isConnecting ? 'Connecting...' : 'Add Site'}
              </button>
            </div>

            {status.message && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  status.type === 'error'
                    ? 'border-accent-red/25 bg-accent-red/10 text-accent-red'
                    : 'border-accent-green/25 bg-accent-green/10 text-accent-green'
                }`}
              >
                {status.message}
              </div>
            )}

            <div className="mt-4 p-3 bg-bg-base rounded-lg border border-bg-border">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Active Site</p>
                  <p className="text-sm text-text-primary mt-1">{activeSiteLabel}</p>
                  {activeSite?.url && (
                    <p className="text-[11px] text-text-secondary font-mono mt-1 break-all">{activeSite.url}</p>
                  )}
                </div>
                <div className="text-[11px] text-text-muted font-mono mt-2 sm:mt-0">
                  Last analyzed: {formatDateTime(activeSite?.lastAnalyzedAt)}
                </div>
              </div>
            </div>

            {summary && activeSite && (
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { label: 'Pages Scanned', value: summary.pagesScanned || 0 },
                  { label: 'Issues Found', value: summary.issuesFound || 0 },
                  { label: 'Internal Links', value: summary.internalLinks || 0 },
                  { label: 'Avg Response', value: `${summary.averageResponseTimeMs || 0}ms` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                    <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{item.label}</p>
                    <p className="text-lg text-text-primary mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {topPages.length > 0 && activeSite && (
              <div className="mt-4 rounded-lg border border-bg-border overflow-hidden">
                <div className="px-3 py-2 border-b border-bg-border bg-bg-base">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Top Discovered Pages</p>
                </div>
                <div className="divide-y divide-bg-border">
                  {topPages.map((page) => (
                    <div key={page.page} className="px-3 py-2 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        {page.fullUrl ? (
                          <a
                            href={page.fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-text-primary font-mono truncate hover:text-accent-cyan transition-colors inline-block max-w-full"
                            title={page.fullUrl}
                          >
                            {page.page}
                          </a>
                        ) : (
                          <p className="text-xs text-text-primary font-mono truncate">{page.page}</p>
                        )}
                        {page.title && <p className="text-[11px] text-text-muted truncate mt-0.5">{page.title}</p>}
                      </div>
                      <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">
                        {page.internalLinks || 0} links
                      </div>
                      <div className="text-[11px] font-mono text-text-secondary whitespace-nowrap">
                        {page.responseTimeMs || 0}ms
                      </div>
                      <div
                        className={`text-[11px] font-mono whitespace-nowrap ${
                          page.issueCount > 0 ? 'text-accent-red' : 'text-accent-green'
                        }`}
                      >
                        {page.issueCount > 0 ? `${page.issueCount} issues` : 'Healthy'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card glow className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Registered Domains</CardTitle>
            <Globe size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-text-secondary mb-3">
              Choose which domain is active for the dashboard, deactivate domains you want to pause, and delete any registered URL from here.
            </p>

            <div className="space-y-2">
              {sites.length > 0 ? (
                sites.map((site) => {
                  const badge = getSiteBadge(site)
                  const isPending = pendingSiteAction.id === site.id

                  return (
                    <div key={site.id} className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-text-primary">{site.name || site.url}</p>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-secondary font-mono mt-1 break-all">{site.url}</p>
                          <p className="text-[11px] text-text-muted mt-1">
                            Last analyzed: {formatDateTime(site.lastAnalyzedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => runSiteAction(site, 'analyze')}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-all disabled:opacity-60"
                          >
                            {isPending && pendingSiteAction.type === 'analyze' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Analyze
                          </button>

                          {!site.isActive && (
                            <button
                              onClick={() => runSiteAction(site, 'activate')}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-green/25 bg-accent-green/10 text-accent-green text-xs hover:bg-accent-green/20 transition-all disabled:opacity-60"
                            >
                              {isPending && pendingSiteAction.type === 'activate' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              Activate
                            </button>
                          )}

                          {site.isEnabled && (
                            <button
                              onClick={() => runSiteAction(site, 'deactivate')}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-amber/25 bg-accent-amber/10 text-accent-amber text-xs hover:bg-accent-amber/20 transition-all disabled:opacity-60"
                            >
                              {isPending && pendingSiteAction.type === 'deactivate' ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                              Deactivate
                            </button>
                          )}

                          <button
                            onClick={() => runSiteAction(site, 'delete')}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-red/25 bg-accent-red/10 text-accent-red text-xs hover:bg-accent-red/20 transition-all disabled:opacity-60"
                          >
                            {isPending && pendingSiteAction.type === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-3 bg-bg-elevated rounded-lg border border-dashed border-bg-border text-xs text-text-muted">
                  No domains registered yet. Add your first site above to start managing active and inactive URLs.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card glow>
          <CardHeader>
            <CardTitle>{serverManagedAi ? 'Workspace AI Access' : 'Custom AI Provider'}</CardTitle>
            <Bot size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            {serverManagedAi ? (
              <>
                <p className="text-xs text-text-secondary mb-3">
                  Workspace AI is connected on the server. Users only need to sign in with Google or their existing account and open the AI workspace.
                </p>

                <div className="rounded-lg border border-bg-border bg-bg-elevated p-3 space-y-3">
                  <div className="rounded-lg border border-accent-green/20 bg-accent-green/10 px-3 py-2 text-[11px] text-accent-green">
                    Shared AI is live for the whole workspace. No personal AI key, Puter sign-in, or extra AI account is required.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-bg-border bg-bg-base px-3 py-2">
                      <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Access</p>
                      <p className="text-sm text-text-primary mt-1">Google sign-in is enough</p>
                    </div>
                    <div className="rounded-lg border border-bg-border bg-bg-base px-3 py-2">
                      <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Source</p>
                      <p className="text-sm text-text-primary mt-1">{getAiSourceLabel(aiRuntime.source)}</p>
                    </div>
                    <div className="rounded-lg border border-bg-border bg-bg-base px-3 py-2">
                      <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Model</p>
                      <p className="text-sm text-text-primary mt-1 break-all">{aiRuntime.model || 'Default model'}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-bg-border bg-bg-base px-3 py-2">
                    <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Provider</p>
                    <p className="text-sm text-text-primary mt-1">{aiRuntime.provider || 'Server shared provider'}</p>
                  </div>

                  <Link
                    to="/ai"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-green/25 bg-accent-green/10 text-accent-green text-xs hover:bg-accent-green/20 transition-all"
                  >
                    <MessageSquare size={12} />
                    Open AI Workspace
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-text-secondary mb-3">
                  The AI workspace includes a built-in analytics copilot. This section is only for an optional custom OpenAI-compatible provider such as OpenRouter.
                </p>

                <div className="rounded-lg border border-bg-border bg-bg-elevated p-3 space-y-3">
                  <div className="rounded-lg border border-accent-cyan/20 bg-accent-cyan/8 px-3 py-2 text-[11px] text-text-secondary">
                    Built-in AI works immediately. If you want your own provider and billing, you can still save a personal override here.
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-text-primary">Enable AI copilot</p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        Optional override if you want to use your own provider instead of the default built-in mode.
                      </p>
                    </div>
                    <button
                      onClick={() => setAiForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`w-9 h-5 rounded-full border transition-all ${
                        aiForm.enabled
                          ? 'bg-accent-cyan/20 border-accent-cyan/40'
                          : 'bg-bg-base border-bg-border'
                      }`}
                    >
                      <span
                        className={`block w-3 h-3 rounded-full mx-0.5 transition-transform ${
                          aiForm.enabled ? 'bg-accent-cyan translate-x-4' : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-text-muted block mb-1">PROVIDER LABEL</label>
                    <input
                      type="text"
                      value={aiForm.provider}
                      onChange={(event) => setAiForm((prev) => ({ ...prev, provider: event.target.value }))}
                      placeholder="openai-compatible"
                      className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-text-muted block mb-1">BASE URL</label>
                    <input
                      type="url"
                      value={aiForm.baseUrl}
                      onChange={(event) => setAiForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                      placeholder={DEFAULT_AI_BASE_URL}
                      className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-text-muted block mb-1">MODEL ID</label>
                    <input
                      type="text"
                      value={aiForm.model}
                      onChange={(event) => setAiForm((prev) => ({ ...prev, model: event.target.value }))}
                      placeholder={DEFAULT_AI_MODEL}
                      className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-text-muted block mb-1">API KEY</label>
                    <div className="flex items-center gap-2">
                      <input
                        type={showAiApiKey ? 'text' : 'password'}
                        value={aiForm.apiKey}
                        onChange={(event) => setAiForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                        placeholder={aiSettings?.hasApiKey ? 'Saved key exists. Paste a new one to replace it.' : 'Paste your provider API key'}
                        className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                      />
                      <button
                        onClick={() => setShowAiApiKey((prev) => !prev)}
                        type="button"
                        className="p-2 rounded-lg border border-bg-border bg-bg-base text-text-muted hover:text-accent-cyan transition-colors"
                        title={showAiApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showAiApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">
                      Saved key status: {aiSettings?.hasApiKey ? 'Connected' : 'No saved key yet'}
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-text-muted block mb-1">SYSTEM PROMPT</label>
                    <textarea
                      rows={5}
                      value={aiForm.systemPrompt}
                      onChange={(event) => setAiForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
                      className="w-full resize-y bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>

                  {aiStatus.message && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        aiStatus.type === 'error'
                          ? 'border-accent-red/25 bg-accent-red/10 text-accent-red'
                          : 'border-accent-green/25 bg-accent-green/10 text-accent-green'
                      }`}
                    >
                      {aiStatus.message}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={saveAiSettings}
                      disabled={isSavingAi || isClearingAiKey}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-all disabled:opacity-60"
                    >
                      {isSavingAi ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save AI Settings
                    </button>

                    <button
                      onClick={clearSavedAiKey}
                      disabled={isSavingAi || isClearingAiKey || !aiSettings?.hasApiKey}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-red/25 bg-accent-red/10 text-accent-red text-xs hover:bg-accent-red/20 transition-all disabled:opacity-60"
                    >
                      {isClearingAiKey ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Remove Saved Key
                    </button>

                    <Link
                      to="/ai"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-green/25 bg-accent-green/10 text-accent-green text-xs hover:bg-accent-green/20 transition-all"
                    >
                      <MessageSquare size={12} />
                      Open AI Workspace
                    </Link>
                  </div>

                  <div className="text-[10px] text-text-muted">
                    Tip: you can skip all of this and use the AI workspace immediately. Save a custom provider only if you want your own model and billing.
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card glow>
          <CardHeader>
            <CardTitle>Advanced API Key</CardTitle>
            <Key size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-text-secondary mb-3">
              Use one API key for your account. Events are filtered by the connected domain list, so deactivated sites stop sending usable tracking data.
            </p>
            <div className="flex items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-bg-border">
              <code className="text-xs font-mono text-accent-cyan flex-1 truncate">
                {displayKey || 'API key not available'}
              </code>
              <button
                onClick={copyKey}
                disabled={!displayKey}
                className="p-1.5 rounded hover:bg-bg-base transition-colors text-text-muted hover:text-accent-cyan"
              >
                {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card glow>
          <CardHeader>
            <CardTitle>Privacy & Security</CardTitle>
            <Shield size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { key: 'anonymizeIP', label: 'Anonymize IP addresses', desc: 'Mask the last octet of visitor IPs' },
                { key: 'rateLimit', label: 'Rate limiting', desc: 'Protect against event spam and noisy domains' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-text-primary">{label}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => toggle(key)}
                    className={`w-9 h-5 rounded-full border transition-all ${
                      settings[key]
                        ? 'bg-accent-cyan/20 border-accent-cyan/40'
                        : 'bg-bg-elevated border-bg-border'
                    }`}
                  >
                    <span
                      className={`block w-3 h-3 rounded-full mx-0.5 transition-transform ${
                        settings[key] ? 'bg-accent-cyan translate-x-4' : 'bg-text-muted translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}

              <div className="pt-2 border-t border-bg-border">
                <label className="text-[10px] font-mono text-text-muted block mb-1">DATA RETENTION (DAYS)</label>
                <select
                  value={settings.retentionDays}
                  onChange={(event) => setSettings((prev) => ({ ...prev, retentionDays: event.target.value }))}
                  className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-cyan/40"
                >
                  {['30', '60', '90', '365'].map((days) => (
                    <option key={days} value={days}>{days} days</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card glow>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <Bell size={13} className="text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { key: 'emailAlerts', label: 'Email alerts', desc: 'Get alert emails for threshold breaches' },
                { key: 'slackAlerts', label: 'Slack notifications', desc: 'Post alerts to a Slack channel' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-text-primary">{label}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => toggle(key)}
                    className={`w-9 h-5 rounded-full border transition-all ${
                      settings[key]
                        ? 'bg-accent-cyan/20 border-accent-cyan/40'
                        : 'bg-bg-elevated border-bg-border'
                    }`}
                  >
                    <span
                      className={`block w-3 h-3 rounded-full mx-0.5 transition-transform ${
                        settings[key] ? 'bg-accent-cyan translate-x-4' : 'bg-text-muted translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}

              <div className="pt-2 border-t border-bg-border">
                <input
                  type="text"
                  placeholder="#alerts-channel"
                  className="w-full bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-xs text-text-secondary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
