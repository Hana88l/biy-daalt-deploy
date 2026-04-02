import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  Sparkles,
  Send,
  Loader2,
  Settings,
  Globe,
  BarChart3,
  AlertTriangle,
  Activity,
  Wand2,
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useAnalyticsContext } from '../context/AnalyticsContext'
import { useAuth } from '../context/AuthContext'
import { fetchWithAuth } from '../utils/api'

const STARTER_PROMPTS = [
  'Сүүлийн 7 хоногийн analytics дээрх гол өөрчлөлтүүдийг тайлбарла.',
  'Top pages болон alerts-оос харахад яг ямар асуудал түрүүлж засах ёстой вэ?',
  'Conversion-ийг өсгөхийн тулд эхний 3 action санал болго.',
  'Энэ dashboard-ийн датагаар богинохон executive summary бич.',
  'Улаанбаатарын хаврын цаг агаар ер нь ямар байдаг вэ?',
  'React дээр state ба props-ийн ялгааг энгийнээр тайлбарла.',
]

function buildWelcomeMessage({ available, siteLabel, dateRange, model, modeLabel, source, isAdmin }) {
  if (!available) {
    return isAdmin
      ? 'AI одоогоор идэвхгүй байна. Settings дээр нэг AI provider холбоход бүх хэрэглэгч шууд ашиглаж чадна.'
      : 'AI одоогоор бэлэн биш байна. Admin нэг shared AI provider холбоход шууд ашиглаж эхэлнэ.'
  }

  if (source === 'env_shared' || source === 'admin_shared') {
    return `Workspace AI is ready for ${siteLabel || 'your dashboard'}. Since you are already signed in, no extra AI account or API key is needed. I can answer both dashboard questions and general topics in Mongolian. Active model: ${model || 'default model'}.`
  }

  return `AI assistant is ready for ${siteLabel || 'your dashboard'}. I can use the current ${dateRange} analytics context when needed, and I can also answer general questions in Mongolian. Mode: ${modeLabel}. Active model: ${model || 'default model'}.`
}

function buildAnalyticsContext({
  user,
  dateRange,
  kpis,
  topPages,
  alerts,
  events,
  funnel,
  deviceData,
  countryData,
}) {
  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    activeSite: user?.activeSite || (user?.siteUrl ? { url: user.siteUrl, name: user.siteName || null } : null),
    kpis: {
      totalEvents: Number(kpis?.totalEvents || 0),
      totalUsers: Number(kpis?.totalUsers || 0),
      pageViews: Number(kpis?.pageViews || 0),
      errors: Number(kpis?.errors || 0),
      errorRate: Number(kpis?.errorRate || 0),
      averageResponseTimeMs: Number(kpis?.averageResponseTimeMs || 0),
      pagesScanned: Number(kpis?.pagesScanned || 0),
      internalLinks: Number(kpis?.internalLinks || 0),
      issuesFound: Number(kpis?.issuesFound || 0),
      liveTrackingDetected: Boolean(kpis?.liveTrackingDetected),
      siteMode: Boolean(kpis?.siteMode),
    },
    topPages: (topPages || []).slice(0, 8).map((page) => ({
      page: page.page,
      views: Number(page.views || 0),
      status: page.status || page.health || 'n/a',
      avgTime: page.avgTime || page.load || 'n/a',
      title: page.title || '',
    })),
    alerts: (alerts || []).slice(0, 5).map((alert) => ({
      type: alert.type,
      message: alert.message,
      time: alert.time,
    })),
    recentEvents: (events || []).slice(0, 6).map((event) => ({
      event: event.event,
      page: event.page,
      userId: event.userId,
      time: event.time,
    })),
    funnel: (funnel || []).slice(0, 6),
    devices: (deviceData || []).slice(0, 5),
    countries: (countryData || []).slice(0, 5),
  }
}

function getModeLabel(source) {
  switch (source) {
    case 'local_builtin':
      return 'Built-in analytics copilot'
    case 'user':
      return 'Personal provider'
    case 'admin_shared':
      return 'Workspace shared provider'
    case 'env_shared':
      return 'Workspace shared AI'
    default:
      return 'Unavailable'
  }
}

export default function AIPage() {
  const { user } = useAuth()
  const {
    dateRange,
    kpis,
    topPages,
    alerts,
    events,
    funnel,
    deviceData,
    countryData,
  } = useAnalyticsContext()

  const isAdmin = user?.email === 'admin@quantum.com'
  const savedCustomAi = user?.aiSettings || null
  const siteLabel = user?.activeSite?.name || user?.activeSite?.url || user?.siteName || user?.siteUrl || 'your dashboard'
  const contextPayload = useMemo(
    () =>
      buildAnalyticsContext({
        user,
        dateRange,
        kpis,
        topPages,
        alerts,
        events,
        funnel,
        deviceData,
        countryData,
      }),
    [alerts, countryData, dateRange, deviceData, events, funnel, kpis, topPages, user]
  )

  const [runtime, setRuntime] = useState({
    loading: true,
    available: false,
    source: 'none',
    shared: false,
    provider: null,
    baseUrl: null,
    model: null,
    requiresExternalAuth: false,
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const endRef = useRef(null)
  const likelyInvalidSavedProvider = Boolean(
    savedCustomAi?.enabled &&
    savedCustomAi?.hasApiKey &&
    !runtime.loading &&
    runtime.source === 'local_builtin'
  )

  useEffect(() => {
    let cancelled = false

    const loadRuntime = async () => {
      try {
        const response = await fetchWithAuth('/ai/settings')
        if (cancelled) return
        setRuntime({
          loading: false,
          available: Boolean(response?.runtime?.available),
          source: response?.runtime?.source || 'none',
          shared: Boolean(response?.runtime?.shared),
          provider: response?.runtime?.provider || null,
          baseUrl: response?.runtime?.baseUrl || null,
          model: response?.runtime?.model || null,
          requiresExternalAuth: false,
        })
      } catch {
        if (cancelled) return
        setRuntime((prev) => ({ ...prev, loading: false }))
      }
    }

    loadRuntime()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.aiSettings?.enabled, user?.aiSettings?.model, user?.aiSettings?.hasApiKey])

  useEffect(() => {
    setMessages((prev) => {
      const rest = prev.filter((message) => message.id !== 'welcome')
      return [
        {
          id: 'welcome',
          role: 'assistant',
          content: buildWelcomeMessage({
            available: runtime.available,
            siteLabel,
            dateRange,
            model: runtime.model,
            modeLabel: getModeLabel(runtime.source),
            source: runtime.source,
            isAdmin,
          }),
        },
        ...rest,
      ]
    })
  }, [dateRange, isAdmin, runtime.available, runtime.model, runtime.source, siteLabel])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [isSending, messages])

  const sendMessage = async (presetText) => {
    const prompt = String(presetText ?? input).trim()
    if (!prompt || isSending) return

    if (!runtime.available) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: isAdmin
            ? 'Workspace AI холбогдоогүй байна. Settings дээр server shared provider-ийг шалгаад дахин оролдоно уу.'
            : 'AI access түр бэлэн биш байна. Google-оор нэвтэрсэн хэрэглэгчид shared provider холбогдмогц шууд ашиглаж чадна.',
        },
      ])
      return
    }

    const nextMessages = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: prompt,
      },
    ]

    setMessages(nextMessages)
    setInput('')
    setIsSending(true)

    try {
      const response = await fetchWithAuth('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: contextPayload,
        }),
      })

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now() + 1}`,
          role: 'assistant',
          content: response?.message?.content || 'AI provider returned no message.',
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: err?.message || 'Failed to contact the AI provider.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Layout title="AI Workspace" subtitle="Ask about your dashboard, coding, ideas, writing, or general topics in Mongolian">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4 max-w-7xl">
        <div className="space-y-4">
          <Card glow>
            <CardHeader>
              <CardTitle>Assistant Status</CardTitle>
              <Bot size={13} className="text-text-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-bg-border bg-bg-elevated p-3">
                <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Current Site</p>
                <p className="text-sm text-text-primary mt-1 break-all">{siteLabel}</p>
              </div>

              <div className="rounded-lg border border-bg-border bg-bg-elevated p-3">
                <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">AI Status</p>
                <p className={`text-sm mt-1 ${runtime.available ? 'text-accent-green' : 'text-accent-amber'}`}>
                  {runtime.loading ? 'Checking availability...' : runtime.available ? 'Ready to use' : 'Provider not connected'}
                </p>
                <p className="text-[11px] text-text-muted mt-1">
                  {runtime.available
                    ? runtime.shared
                      ? `${runtime.model || 'Default model'} is connected for every signed-in workspace user.`
                      : `${runtime.model || 'Default model'} via ${getModeLabel(runtime.source)}`
                    : likelyInvalidSavedProvider
                      ? 'A saved provider key exists but it looks invalid for AI usage. Open Settings and replace it with a real OpenRouter/OpenAI key.'
                    : isAdmin
                      ? 'Connect one provider once and everyone can use AI with no extra signup.'
                      : 'No extra AI signup is required. Sign in and open the workspace once the shared provider is connected.'}
                </p>
                {runtime.source === 'local_builtin' && (
                  <p className="text-[11px] text-accent-cyan mt-1">
                    Built-in mode is active, so AI works immediately without any external API key.
                  </p>
                )}
              </div>

              <Link
                to="/settings"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-all"
              >
                <Settings size={12} />
                View AI Access
              </Link>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader>
              <CardTitle>Mode</CardTitle>
              <Wand2 size={13} className="text-text-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Active Mode</p>
                  <p className="text-sm text-text-primary mt-1">{getModeLabel(runtime.source)}</p>
                </div>
                <div className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">External Signup</p>
                  <p className="text-sm text-text-primary mt-1">Not required</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader>
              <CardTitle>Live Context</CardTitle>
              <Sparkles size={13} className="text-text-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { icon: Activity, label: 'Total Events', value: Number(kpis?.totalEvents || 0).toLocaleString() },
                  { icon: Globe, label: 'Top Pages', value: String((topPages || []).length) },
                  { icon: AlertTriangle, label: 'Alerts', value: String((alerts || []).length) },
                  { icon: BarChart3, label: 'Date Range', value: dateRange },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
                    <div className="flex items-center gap-2 text-text-secondary">
                      <Icon size={12} />
                      <span className="text-xs">{label}</span>
                    </div>
                    <span className="text-xs font-mono text-text-primary">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader>
              <CardTitle>Starter Prompts</CardTitle>
              <Sparkles size={13} className="text-text-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    disabled={isSending || runtime.loading}
                    className="w-full text-left rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-accent-cyan/30 transition-all disabled:opacity-60"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card glow className="min-h-[70vh] flex flex-col">
          <CardHeader>
            <CardTitle>AI Assistant</CardTitle>
            {isSending ? <Loader2 size={13} className="text-accent-cyan animate-spin" /> : <Bot size={13} className="text-text-muted" />}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="flex-1 min-h-[420px] rounded-xl border border-bg-border bg-bg-base/60 p-3 overflow-y-auto">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-3xl rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'ml-auto bg-accent-cyan/12 border border-accent-cyan/25 text-text-primary'
                        : 'bg-bg-elevated border border-bg-border text-text-secondary'
                    }`}
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider mb-1 text-text-muted">
                      {message.role === 'user' ? 'You' : 'Quantum AI'}
                    </div>
                    {message.content}
                  </div>
                ))}

                {isSending && (
                  <div className="max-w-3xl rounded-xl px-3 py-2 text-sm bg-bg-elevated border border-bg-border text-text-secondary inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent-cyan" />
                    Thinking...
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage()
              }}
              className="rounded-xl border border-bg-border bg-bg-card p-3"
            >
              <label className="text-[10px] font-mono text-text-muted block mb-2">ASK ANYTHING</label>
              <div className="flex flex-col gap-2 md:flex-row">
                <textarea
                  rows={3}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Жишээ: Энэ долоо хоногийн analytics-аа тайлбарла, эсвэл React hook, цаг агаар, орчуулга гээд ерөнхий зүйл ч асууж болно."
                  className="flex-1 resize-none bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan/40"
                />
                <button
                  type="submit"
                  disabled={isSending || !input.trim() || runtime.loading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan/12 border border-accent-cyan/25 text-accent-cyan text-sm hover:bg-accent-cyan/20 transition-all disabled:opacity-60"
                >
                  {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
