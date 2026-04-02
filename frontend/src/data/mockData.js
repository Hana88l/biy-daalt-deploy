// Mock data generators for Analytics Dashboard

export const generateVisitorData = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map((day, i) => ({
    day,
    visitors: Math.floor(3000 + Math.random() * 4000),
    pageViews: Math.floor(8000 + Math.random() * 10000),
    sessions: Math.floor(2000 + Math.random() * 3000),
  }))
}

export const generateEventStream = () => {
  const events = ['page_view', 'click', 'purchase', 'signup', 'error', 'logout']
  const pages = ['/home', '/pricing', '/docs', '/dashboard', '/signup', '/blog']
  const countries = ['US', 'MN', 'JP', 'DE', 'GB', 'CN', 'KR', 'FR']
  const stream = []
  for (let i = 0; i < 20; i++) {
    stream.push({
      id: i,
      event: events[Math.floor(Math.random() * events.length)],
      page: pages[Math.floor(Math.random() * pages.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      time: `${Math.floor(Math.random() * 59)}s ago`,
      userId: `user_${Math.random().toString(36).substr(2, 6)}`,
    })
  }
  return stream
}

export const generateHourlyData = () => {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    events: Math.floor(200 + Math.sin(i / 4) * 150 + Math.random() * 100),
    errors: Math.floor(Math.random() * 15),
  }))
}

export const generateFunnelData = () => [
  { stage: 'Visitors', value: 12480, pct: 100 },
  { stage: 'Sign Up', value: 4320, pct: 34.6 },
  { stage: 'Onboarding', value: 2890, pct: 23.2 },
  { stage: 'Active User', value: 1640, pct: 13.1 },
  { stage: 'Paid', value: 820, pct: 6.6 },
]

export const generateTopPages = () => [
  { page: '/dashboard', views: 8420, bounce: '24%', avg: '4:32' },
  { page: '/pricing', views: 5231, bounce: '41%', avg: '2:18' },
  { page: '/home', views: 4890, bounce: '62%', avg: '1:05' },
  { page: '/docs/quickstart', views: 3310, bounce: '18%', avg: '6:44' },
  { page: '/blog', views: 2740, bounce: '55%', avg: '3:12' },
  { page: '/signup', views: 2210, bounce: '33%', avg: '2:51' },
]

export const generateDeviceData = () => [
  { name: 'Desktop', value: 52, color: 'rgb(var(--color-accent-cyan) / 1)' },
  { name: 'Mobile', value: 35, color: 'rgb(var(--color-accent-green) / 1)' },
  { name: 'Tablet', value: 13, color: 'rgb(var(--color-accent-purple) / 1)' },
]

export const generateCountryData = () => [
  { country: 'United States', visitors: 4820, flag: '🇺🇸' },
  { country: 'Mongolia', visitors: 2340, flag: '🇲🇳' },
  { country: 'Japan', visitors: 1890, flag: '🇯🇵' },
  { country: 'Germany', visitors: 1540, flag: '🇩🇪' },
  { country: 'South Korea', visitors: 1230, flag: '🇰🇷' },
  { country: 'France', visitors: 980, flag: '🇫🇷' },
]

export const kpiData = [
  {
    id: 'visitors',
    label: 'Total Visitors',
    value: '124,832',
    change: '+18.4%',
    trend: 'up',
    color: 'cyan',
    icon: 'Users',
    sparkline: [40, 55, 48, 62, 70, 65, 80, 88, 75, 92, 85, 100],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    value: '$48,291',
    change: '+12.1%',
    trend: 'up',
    color: 'green',
    icon: 'DollarSign',
    sparkline: [30, 40, 38, 50, 48, 60, 55, 68, 72, 80, 76, 90],
  },
  {
    id: 'conversion',
    label: 'Conversion Rate',
    value: '6.58%',
    change: '-0.3%',
    trend: 'down',
    color: 'amber',
    icon: 'TrendingUp',
    sparkline: [70, 68, 72, 69, 65, 67, 64, 62, 66, 63, 65, 61],
  },
  {
    id: 'errors',
    label: 'Error Rate',
    value: '0.42%',
    change: '-22%',
    trend: 'down',
    color: 'red',
    icon: 'AlertCircle',
    sparkline: [20, 18, 22, 15, 12, 16, 10, 8, 12, 6, 8, 4],
  },
]

export const alertsData = [
  { id: 1, type: 'warning', message: 'Error rate spike on /api/payment', time: '2m ago', ack: false },
  { id: 2, type: 'info', message: 'Traffic 40% above baseline', time: '8m ago', ack: false },
  { id: 3, type: 'success', message: 'Conversion goal reached: 500 signups', time: '1h ago', ack: true },
  { id: 4, type: 'error', message: 'DB query timeout on analytics worker', time: '2h ago', ack: true },
]
