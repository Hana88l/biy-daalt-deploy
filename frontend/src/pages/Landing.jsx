import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  Globe,
  LayoutDashboard,
  Moon,
  Radio,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { useTheme } from '../context/ThemeContext'

const SLIDE_TRANSITION_MS = 750

const slides = [
  {
    id: 'about',
    label: 'Тухай',
    eyebrow: 'Quantum Stars',
    title: 'Quantum Stars analytics workspace',
    description:
      'Quantum Stars нь сайт дээр юу болж байгааг realtime, ойлгомжтой, action авахад бэлэн хэлбэрээр харуулдаг dashboard юм.',
    points: [
      'Нэг дэлгэц дээр KPI, page activity, алдаа, conversion урсгал, alerts бүгд цэгцтэй харагдана.',
      'Админ болон энгийн хэрэглэгч аль аль нь өөрийн харах түвшиндээ датагаа удирдана.',
      'UI нь SaaS dashboard маягийн хурдан уншигддаг, шийдвэр гаргахад чиглэсэн бүтэцтэй.',
    ],
    accent: 'cyan',
  },
  {
    id: 'flow',
    label: 'Ажиллах Зарчим',
    eyebrow: 'How It Works',
    title: 'Dashboard-ын дэлгэрэнгүй мэдээлэл',
    description:
      'Эхлээд домэйнээ холбоно. Дараа нь Quantum Stars тухайн сайтыг тань хянаж, ирж буй дохио бүрийг dashboard-ийн зөв хэсэгт байрлуулна.',
    points: [
      'Идэвхтэй сайт сонгогдсон мөчөөс тухайн domain нь dashboard-ийн гол context болно.',
      'Зочдын үйлдэл, auth оролдлого, алдаа, page activity нь live байдлаар шинэчлэгдэнэ.',
      'Систем нь датагаа KPI, Logs, Events, Alerts, AI Workspace руу автоматаар ангилна.',
    ],
    accent: 'green',
  },
  {
    id: 'steps',
    label: 'Алхамууд',
    eyebrow: 'Launch Steps',
    title: 'Quantum Stars-ийг ашиглаж эхлэх товч дараалал',
    description:
      'Хэт олон тохиргоо шаардахгүй. Гол нь сайтаа холбоод, идэвхтэй домэйноо сонгоод, tracking-аа ажиллуулахад хангалттай.',
    points: [
      '1. Нэвтэрч орно. 2. Домэйнээ нэмнэ. 3. Active site-аа сонгоно.',
      '4. Tracking-аа ажиллуулна. 5. Dashboard, alerts, AI-гаа ашиглаж эхэлнэ.',
      'Хэдэн ч сайт холбож болно. Хүссэн үедээ deactivate эсвэл delete хийж удирдана.',
    ],
    accent: 'amber',
  },
  {
    id: 'workspace',
    label: 'Dashboard',
    eyebrow: 'Inside The Workspace',
    title: 'Нэвтэрсний дараа та юу харах вэ?',
    description:
      'Overview нь ерөнхий зураг өгнө. Дараа нь Events, Logs, Metrics, Alerts, Users, AI Workspace руу орж гүнзгийрүүлж ажиллана.',
    points: [
      'Top pages, live events, device/country breakdown, funnel, auth signals бүгд харагдана.',
      'Админ эрхтэй үед нийт хэрэглэгч, signup, auth error зэрэг глобал үзүүлэлтүүд нэмэгдэнэ.',
      'Датагаа export хийж, асуудал гарсан мөчийг timeline-аар нь хянах боломжтой.',
    ],
    accent: 'cyan',
  },
  {
    id: 'control',
    label: 'Удирдлага',
    eyebrow: 'Control Center',
    title: 'Олон сайт, alerts, AI copilot-оо нэг газраас удирдана',
    description:
      'Quantum Stars зөвхөн харуулдаг биш, харсан дата дээрээ тулгуурлаад хурдан action авахад зориулсан workspace юм.',
    points: [
      'Идэвхтэй домэйнээ сольж, шаардлагагүй сайтыг pause хийж, бүртгэсэн domain-оо устгаж болно.',
      'Threshold-based alerts нь асуудлыг эрт мэдэгдэнэ.',
      'Built-in AI copilot нь тайлбар, эрэмбэлэлт, дараагийн алхмыг шууд санал болгоно.',
    ],
    accent: 'purple',
  },
  {
    id: 'start',
    label: 'Эхлэх',
    eyebrow: 'Ready',
    title: 'Analytics workflow-оо нэг цэгт төвлөрүүл',
    description:
      'Quantum Stars нь багийн өдөр тутмын шалгалт, асуудал илрүүлэлт, growth review, realtime хяналтыг нэг dashboard руу нэгтгэнэ.',
    points: [
      'Хэрэглэгчийн урсгал, алдаа, top pages, growth signal-уудыг нэг хараад ойлгоно.',
      'Сайт нэмэх, active болгох, data харах, AI-аар тайлбарлуулах бүх урсгал нэгтгэгдсэн.',
      'Эхлэхэд бэлэн бол login эсвэл register хийж, анхны сайтаа холбоно.',
    ],
    accent: 'green',
  },
]

function accentClasses(accent) {
  switch (accent) {
    case 'green':
      return {
        pill: 'border-accent-green/25 bg-accent-green/10 text-accent-green',
        glow: 'bg-accent-green/10',
        border: 'border-accent-green/25',
      }
    case 'amber':
      return {
        pill: 'border-accent-amber/25 bg-accent-amber/10 text-accent-amber',
        glow: 'bg-accent-amber/10',
        border: 'border-accent-amber/25',
      }
    case 'purple':
      return {
        pill: 'border-accent-purple/25 bg-accent-purple/10 text-accent-purple',
        glow: 'bg-accent-purple/10',
        border: 'border-accent-purple/25',
      }
    case 'cyan':
    default:
      return {
        pill: 'border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan',
        glow: 'bg-accent-cyan/10',
        border: 'border-accent-cyan/25',
      }
  }
}

function MetricVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div
      className={`relative hidden h-full min-h-[420px] rounded-[28px] border border-bg-border bg-bg-card/90 p-5 lg:block transition-all duration-700 ${
        isActive ? 'opacity-100 translate-x-0 scale-100' : 'opacity-30 translate-x-8 scale-[0.97]'
      }`}
    >
      <div className={`absolute right-10 top-8 h-24 w-24 rounded-full blur-3xl ${accentStyle.glow}`} />

      <div className="flex items-center gap-3 border-b border-bg-border pb-4">
        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
          <Activity size={18} className="text-accent-cyan" />
        </div>
        <div>
          <p className="font-display text-sm font-700 text-text-primary tracking-tight">
            Quantum <span className="text-gradient-cyan">Stars</span>
          </p>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Workspace Preview</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {[
          { label: 'Live Signals', value: '2.4K' },
          { label: 'Active Pages', value: '184' },
          { label: 'Alerts', value: '03' },
          { label: 'Response', value: '218ms' },
        ].map((item, index) => (
          <div
            key={item.label}
            className={`rounded-2xl border border-bg-border bg-bg-elevated px-4 py-4 transition-all duration-700 ${
              isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
            style={{ transitionDelay: `${index * 70}ms` }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">{item.label}</p>
            <p className="mt-2 text-2xl font-700 text-text-primary">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[1.15fr_0.85fr] gap-3">
        <div className="rounded-2xl border border-bg-border bg-bg-elevated p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono uppercase tracking-[0.18em] text-text-muted">Top Pages</p>
            <LayoutDashboard size={13} className="text-text-muted" />
          </div>
          <div className="mt-4 space-y-3">
            {[
              ['/pricing', 'Healthy'],
              ['/checkout', 'Watch'],
              ['/signup', 'Live'],
            ].map(([page, state]) => (
              <div key={page} className="flex items-center justify-between rounded-xl border border-bg-border bg-bg-card px-3 py-2">
                <div>
                  <p className="text-xs font-mono text-text-primary">{page}</p>
                  <p className="text-[10px] text-text-muted">Realtime page activity</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${accentStyle.pill}`}>
                  {state}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-bg-border bg-bg-elevated p-4 float-gentle">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-text-muted">Alerts</p>
              <Bell size={13} className="text-accent-amber" />
            </div>
            <p className="mt-4 text-sm text-text-primary">Auth error spike detected</p>
            <p className="mt-1 text-[11px] leading-5 text-text-secondary">Quantum Stars identifies the change and keeps it visible in one place.</p>
          </div>
          <div className="rounded-2xl border border-bg-border bg-bg-elevated p-4 float-gentle-delay">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-text-muted">AI</p>
              <Bot size={13} className="text-accent-cyan" />
            </div>
            <p className="mt-4 text-sm text-text-primary">Priority insight ready</p>
            <p className="mt-1 text-[11px] leading-5 text-text-secondary">Copilot summarizes what changed and what to fix first.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlowVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div className={`hidden lg:grid lg:grid-cols-2 gap-3 transition-all duration-700 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-25 translate-x-10'}`}>
      {[
        { icon: ShieldCheck, title: 'Login', text: 'Team enters the workspace and opens its analytics view.' },
        { icon: Globe, title: 'Connect', text: 'The first domain becomes the active monitoring context.' },
        { icon: Radio, title: 'Track', text: 'Visitor and system signals begin flowing into live analytics.' },
        { icon: BarChart3, title: 'Review', text: 'The workspace turns raw events into readable product decisions.' },
      ].map(({ icon: Icon, title, text }, index) => (
        <div
          key={title}
          className={`rounded-[26px] border border-bg-border bg-bg-card p-5 transition-all duration-700 ${
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ transitionDelay: `${index * 90}ms` }}
        >
          <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${accentStyle.border} ${accentStyle.glow}`}>
            <Icon size={18} className="text-text-primary" />
          </div>
          <p className="mt-4 text-lg font-600 text-text-primary">{title}</p>
          <p className="mt-2 text-xs leading-6 text-text-secondary">{text}</p>
        </div>
      ))}
    </div>
  )
}

function StepsVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div className={`hidden lg:block transition-all duration-700 ${isActive ? 'opacity-100 scale-100' : 'opacity-20 scale-[0.96]'}`}>
      <div className="rounded-[28px] border border-bg-border bg-bg-card p-5">
        <div className="grid gap-3">
          {[
            'Нэвтэрч орно',
            'Домэйнээ нэмнэ',
            'Active site сонгоно',
            'Tracking-аа ажиллуулна',
            'Dashboard-aa өдөр бүр ашиглана',
          ].map((step, index) => (
            <div
              key={step}
              className="flex items-center gap-3 rounded-2xl border border-bg-border bg-bg-elevated px-4 py-4 transition-all duration-700"
              style={{ transform: isActive ? 'translateX(0)' : 'translateX(32px)', opacity: isActive ? 1 : 0, transitionDelay: `${index * 90}ms` }}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accentStyle.border} ${accentStyle.glow} text-sm font-mono text-text-primary`}>
                {index + 1}
              </div>
              <div>
                <p className="text-sm font-600 text-text-primary">{step}</p>
                <p className="text-[11px] text-text-secondary mt-1">Quantum Stars setup flow дотор шат дараалалтай хийгдэнэ.</p>
              </div>
              <ChevronRight size={14} className="ml-auto text-text-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WorkspaceVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div className={`hidden lg:grid lg:grid-cols-2 gap-3 transition-all duration-700 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
      {[
        { icon: LayoutDashboard, title: 'Overview', body: 'Нийт дүр зураг ба KPI' },
        { icon: Zap, title: 'Events', body: 'User action ба signal stream' },
        { icon: Bell, title: 'Alerts', body: 'Эрсдэлийг түрүүлж илрүүлнэ' },
        { icon: Bot, title: 'AI', body: 'Дараагийн action санал болгоно' },
      ].map(({ icon: Icon, title, body }, index) => (
        <div
          key={title}
          className="rounded-[26px] border border-bg-border bg-bg-card p-5 transition-all duration-700"
          style={{ transform: isActive ? 'translateY(0)' : 'translateY(28px)', opacity: isActive ? 1 : 0, transitionDelay: `${index * 80}ms` }}
        >
          <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${accentStyle.border} ${accentStyle.glow}`}>
            <Icon size={18} className="text-text-primary" />
          </div>
          <p className="mt-4 text-lg font-600 text-text-primary">{title}</p>
          <p className="mt-2 text-xs leading-6 text-text-secondary">{body}</p>
        </div>
      ))}
    </div>
  )
}

function ControlVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div className={`hidden lg:block transition-all duration-700 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-20 translate-x-10'}`}>
      <div className="rounded-[28px] border border-bg-border bg-bg-card p-5">
        <div className="grid gap-3">
          {[
            { title: 'Multi-site', subtitle: 'Active, ready, deactivated төлөвүүд', icon: Globe },
            { title: 'Alerts', subtitle: 'Хэтрэлт илэрмэгц мэдэгдэнэ', icon: Bell },
            { title: 'AI Copilot', subtitle: 'Юу түрүүлж хийхийг тайлбарлана', icon: Bot },
          ].map(({ title, subtitle, icon: Icon }, index) => (
            <div
              key={title}
              className="rounded-2xl border border-bg-border bg-bg-elevated px-4 py-4 transition-all duration-700"
              style={{ transform: isActive ? 'translateY(0)' : 'translateY(24px)', opacity: isActive ? 1 : 0, transitionDelay: `${index * 90}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${accentStyle.border} ${accentStyle.glow}`}>
                  <Icon size={18} className="text-text-primary" />
                </div>
                <div>
                  <p className="text-sm font-600 text-text-primary">{title}</p>
                  <p className="text-[11px] text-text-secondary mt-1">{subtitle}</p>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-bg-border bg-bg-base px-4 py-4 float-gentle">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-text-muted">Team Focus</p>
              <Target size={14} className="text-accent-cyan" />
            </div>
            <p className="mt-3 text-sm text-text-primary">Нэг site-ээс нөгөөд шилжихэд workflow тасрахгүй.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StartVisual({ isActive, accent }) {
  const accentStyle = accentClasses(accent)

  return (
    <div className={`hidden lg:block transition-all duration-700 ${isActive ? 'opacity-100 scale-100' : 'opacity-20 scale-[0.95]'}`}>
      <div className="rounded-[30px] border border-bg-border bg-bg-card p-6">
        <div className={`rounded-[26px] border ${accentStyle.border} ${accentStyle.glow} p-6`}>
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-text-muted">Launch Status</p>
          <p className="mt-4 text-3xl font-700 tracking-tight text-text-primary">Ready to go</p>
          <p className="mt-3 max-w-md text-sm leading-7 text-text-secondary">
            Танай баг website analytics, issues, growth signal, AI insight-аа нэг dashboard дээр төвлөрүүлж эхлэхэд бэлэн байна.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Sites', value: 'Multi' },
              { label: 'Alerts', value: 'Live' },
              { label: 'AI', value: 'On' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-bg-border bg-bg-card px-3 py-3 text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">{item.label}</p>
                <p className="mt-2 text-lg font-700 text-text-primary">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SlideVisual({ slideId, isActive, accent }) {
  switch (slideId) {
    case 'flow':
      return <FlowVisual isActive={isActive} accent={accent} />
    case 'steps':
      return <StepsVisual isActive={isActive} accent={accent} />
    case 'workspace':
      return <WorkspaceVisual isActive={isActive} accent={accent} />
    case 'control':
      return <ControlVisual isActive={isActive} accent={accent} />
    case 'start':
      return <StartVisual isActive={isActive} accent={accent} />
    case 'about':
    default:
      return <MetricVisual isActive={isActive} accent={accent} />
  }
}

export default function Landing() {
  const { theme, toggleTheme } = useTheme()
  const [activeIndex, setActiveIndex] = useState(0)
  const transitionLockRef = useRef(false)
  const releaseTimerRef = useRef(null)
  const touchStartRef = useRef(null)

  const progress = useMemo(() => `${((activeIndex + 1) / slides.length) * 100}%`, [activeIndex])

  const unlockLater = useCallback(() => {
    window.clearTimeout(releaseTimerRef.current)
    transitionLockRef.current = true
    releaseTimerRef.current = window.setTimeout(() => {
      transitionLockRef.current = false
    }, SLIDE_TRANSITION_MS)
  }, [])

  const goTo = useCallback((nextIndex) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex))
    setActiveIndex((current) => {
      if (current === clamped) return current
      unlockLater()
      return clamped
    })
  }, [unlockLater])

  const goNext = useCallback(() => {
    if (transitionLockRef.current) return
    goTo(activeIndex + 1)
  }, [activeIndex, goTo])

  const goPrev = useCallback(() => {
    if (transitionLockRef.current) return
    goTo(activeIndex - 1)
  }, [activeIndex, goTo])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncBodyOverflow = () => {
      document.body.style.overflow = mediaQuery.matches ? 'hidden' : previousOverflow
    }

    syncBodyOverflow()

    const handleViewportChange = () => {
      syncBodyOverflow()
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleViewportChange)
    } else {
      mediaQuery.addListener(handleViewportChange)
    }

    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(releaseTimerRef.current)

      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleViewportChange)
      } else {
        mediaQuery.removeListener(handleViewportChange)
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault()
        goNext()
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        goPrev()
      }

      if (event.key === 'Home') {
        event.preventDefault()
        goTo(0)
      }

      if (event.key === 'End') {
        event.preventDefault()
        goTo(slides.length - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrev, goTo])

  const onWheel = (event) => {
    if (window.innerWidth < 1024) return
    if (transitionLockRef.current) return
    if (Math.abs(event.deltaY) < 20) return

    event.preventDefault()

    if (event.deltaY > 0) goNext()
    else goPrev()
  }

  const onTouchStart = (event) => {
    touchStartRef.current = event.touches[0]?.clientX || 0
  }

  const onTouchEnd = (event) => {
    const startX = touchStartRef.current
    const endX = event.changedTouches[0]?.clientX || 0
    const delta = startX - endX

    if (Math.abs(delta) < 50 || transitionLockRef.current) return
    if (delta > 0) goNext()
    else goPrev()
  }

  return (
    <div className="relative min-h-[100svh] overflow-x-hidden bg-bg-base grid-bg lg:flex lg:flex-col lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-80 w-80 rounded-full bg-accent-cyan/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-green/10 blur-3xl" />
      </div>

      <header className="relative z-20 border-b border-bg-border bg-bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center shrink-0">
              <Activity size={18} className="text-accent-cyan" />
            </div>
            <div>
              <p className="font-display text-sm font-700 text-text-primary tracking-tight">
                Quantum <span className="text-gradient-cyan">Stars</span>
              </p>
              <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-text-muted">Interactive Walkthrough</p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1 rounded-2xl border border-bg-border bg-bg-elevated/70 p-1">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(index)}
                className={`rounded-xl px-3 py-2 text-[11px] font-mono transition-all ${
                  index === activeIndex
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {slide.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-bg-border bg-bg-elevated text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-all"
            >
              Open Login
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/12 px-3 py-2 text-xs text-accent-cyan hover:bg-accent-cyan/18 transition-all"
            >
              Start Now
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-3 sm:px-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-green transition-all duration-700 ease-out"
              style={{ width: progress }}
            />
          </div>
        </div>
      </header>

      <main
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:flex-1 lg:min-h-0"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative overflow-hidden rounded-[32px] border border-bg-border bg-bg-card/55 backdrop-blur-sm lg:min-h-0 lg:flex-1">
          <div className="min-h-[560px] overflow-hidden sm:min-h-[620px] lg:h-full lg:min-h-0">
            <div
              className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${slides.length * 100}%`, transform: `translateX(-${activeIndex * (100 / slides.length)}%)` }}
            >
              {slides.map((slide, index) => {
                const isActive = index === activeIndex
                const slideAccent = accentClasses(slide.accent)

                return (
                  <section
                    key={slide.id}
                    className="flex w-full shrink-0 items-center px-4 py-5 sm:px-6 lg:h-full lg:px-8"
                    style={{ width: `${100 / slides.length}%` }}
                    aria-hidden={!isActive}
                  >
                    <div className="grid w-full gap-6 lg:h-full lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
                      <div className="flex flex-col gap-6 lg:h-full lg:justify-between">
                        <div className={`transition-all duration-700 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] ${slideAccent.pill}`}>
                            <Sparkles size={12} />
                            {slide.eyebrow}
                          </div>

                          <h1 className="mt-5 max-w-xl font-display text-3xl font-700 leading-tight tracking-tight text-text-primary sm:text-4xl xl:text-[3.2rem]">
                            {slide.title}
                          </h1>

                          <p className="mt-4 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
                            {slide.description}
                          </p>

                          <div className="mt-6 space-y-3">
                            {slide.points.map((point, pointIndex) => (
                              <div
                                key={point}
                                className="flex items-start gap-3 rounded-2xl border border-bg-border bg-bg-elevated/80 px-4 py-3 transition-all duration-700"
                                style={{
                                  transform: isActive ? 'translateX(0)' : 'translateX(-20px)',
                                  opacity: isActive ? 1 : 0,
                                  transitionDelay: `${pointIndex * 90}ms`,
                                }}
                              >
                                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent-cyan" />
                                <p className="text-xs leading-6 text-text-secondary sm:text-[13px]">{point}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className={`flex flex-wrap items-center gap-3 transition-all duration-700 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                          <div className="rounded-2xl border border-bg-border bg-bg-elevated px-4 py-3">
                            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted">Slide</p>
                            <p className="mt-1 text-lg font-700 text-text-primary">
                              {String(index + 1).padStart(2, '0')}
                              <span className="text-text-muted"> / {String(slides.length).padStart(2, '0')}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center lg:h-full">
                        <SlideVisual slideId={slide.id} isActive={isActive} accent={slide.accent} />
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(index)}
                className={`transition-all ${
                  index === activeIndex
                    ? 'h-2.5 w-10 rounded-full bg-accent-cyan'
                    : 'h-2.5 w-2.5 rounded-full bg-bg-border hover:bg-text-muted'
                }`}
                aria-label={`Go to ${slide.label}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIndex === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-bg-border bg-bg-elevated px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-all disabled:opacity-40 disabled:cursor-default"
            >
              <ArrowLeft size={14} />
              Previous
            </button>
            {activeIndex === slides.length - 1 ? (
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/12 px-4 py-2 text-sm text-accent-cyan hover:bg-accent-cyan/18 transition-all"
              >
                Create Account
                <ArrowRight size={14} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/12 px-4 py-2 text-sm text-accent-cyan hover:bg-accent-cyan/18 transition-all"
              >
                Next
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
